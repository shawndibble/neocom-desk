// High-level SSO session flow: login start/complete and access-token supply.
// Refresh tokens live only in local IndexedDB (see src/db) — never sent
// anywhere except login.eveonline.com.

import { generateVerifier, challengeFromVerifier } from './pkce';
import { buildAuthorizeUrl, exchangeCode, refreshToken, type TokenResponse } from './sso';
import { decodeAccessToken, type DecodedAccessToken } from './jwt';
import { db, type CharacterRecord } from '@/db';
import {
  isCachePurgePending,
  purgeCharacterCacheOrSuppress,
  purgeCorpScopedCache,
} from '@/esi/cachePurge';
import { revokedScopes } from '@/esi/scopes';

export interface SsoConfig {
  clientId?: string;
  redirectUri?: string;
}

/** Key prefix for a Pending Login; the rest of the key is its `state`. */
const PKCE_PREFIX = 'neocom.sso.pkce.';

/**
 * Legacy single-slot keys, read but never written. A login that left for SSO
 * before this deploy comes back to a tab holding only these; dropping them
 * would fail every login in flight at release.
 */
const VERIFIER_KEY = 'neocom.sso.verifier';
const STATE_KEY = 'neocom.sso.state';
const SCOPES_KEY = 'neocom.sso.scopes';

/**
 * What the most recent `startLogin` asked for, kept so a failed callback can
 * restart *that* login rather than a different one.
 *
 * `/callback` serves every entry point — Add Character, a `ScopeGate`, a corp
 * grant — and they ask for different scopes. Retrying a failed corp grant as a
 * plain re-auth would succeed while silently not granting corp access, the
 * quiet-downgrade `loginFlow` exists to avoid. Outlives the Pending Login it
 * describes, because the failure it serves is precisely the one where that
 * entry is gone.
 */
const INTENT_KEY = 'neocom.sso.intent';

/**
 * How long a Pending Login stays usable, and how many may exist at once — a
 * per-state store grows where a single slot could not. Both are generous next
 * to a round trip measured in seconds; they exist so an abandoned login is
 * forgotten rather than kept for the life of the tab. The TTL is enforced on
 * read as well as on prune, so it holds in a tab that starts no further login.
 */
const PENDING_TTL_MS = 15 * 60_000;
const MAX_PENDING = 5;

/**
 * How many times a failed callback may restart the sign-in by itself.
 *
 * One. The retry leaves for SSO and comes back to `/callback`, so an
 * unbudgeted one is a redirect loop between the app and EVE — invisible to the
 * user and impossible to interrupt. Counted in storage, not in a ref, because
 * the retry is a full page load.
 */
const RETRY_KEY = 'neocom.sso.autoRetries';
const MAX_AUTO_RETRIES = 1;

/**
 * One authorize round trip this tab has started and not yet finished.
 *
 * Stored under its own `state` rather than in one shared slot, because a
 * shared slot is a race (issue #649): `startLogin` writes the stash and only
 * then does the browser leave for `login.eveonline.com`, so a second press
 * landing in that gap overwrote the verifier the first, already-committing
 * navigation was about to use. SSO then came back with a `state` this tab no
 * longer recognised and the login died. Keyed by `state`, both round trips
 * stay valid and whichever returns is the one that completes.
 */
interface PendingLogin {
  verifier: string;
  /**
   * What this round trip asked SSO for, or `undefined` for "unknown".
   *
   * Not the same as "asked for nothing": `purgeCacheIfConsentChangedOrPending`
   * treats `undefined` as no baseline and falls back to the stored grant, which
   * still catches a revocation, whereas an empty list would assert the app
   * asked for nothing and quietly disable revocation-driven purging. Anything
   * unreadable therefore answers `undefined`, the conservative reading.
   */
  scopes: string[] | undefined;
  createdAt: number;
}

/**
 * Which way a login failed. The callback route recovers from these rather
 * than dead-ending on them, and words them apart when it cannot (issue #649).
 */
export type LoginFailureReason = 'no-login-in-progress' | 'state-mismatch';

/**
 * A login that failed before the token exchange. `AuthError` (`auth/sso.ts`)
 * covers failures at or after it, so `reason` is absent there and the caller
 * treats that as the generic case.
 */
export class LoginError extends Error {
  constructor(
    readonly reason: LoginFailureReason,
    message: string
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

/** Refresh when less than this remains on the access token. */
const EXPIRY_BUFFER_MS = 60_000;

function resolveConfig(config?: SsoConfig): { clientId: string; redirectUri: string } {
  return {
    clientId: config?.clientId ?? (import.meta.env.VITE_EVE_CLIENT_ID as string),
    redirectUri: config?.redirectUri ?? `${location.origin}${import.meta.env.BASE_URL}callback`,
  };
}

/** Stash this round trip's PKCE verifier under its `state` and return the URL. */
export async function startLogin(scopes: string[], config?: SsoConfig): Promise<string> {
  const { clientId, redirectUri } = resolveConfig(config);
  const verifier = generateVerifier();
  const state = generateVerifier(); // independent 32-byte random value
  const pending: PendingLogin = { verifier, scopes, createdAt: Date.now() };
  // Prune first: at quota, the write below would otherwise fail for room that
  // pruning was about to free. `state` is not yet written, so nothing is lost.
  prunePendingLogins(state);
  writeStorage(PKCE_PREFIX + state, JSON.stringify(pending));
  writeStorage(INTENT_KEY, JSON.stringify(scopes));
  return buildAuthorizeUrl({
    clientId,
    redirectUri,
    scopes,
    state,
    challenge: await challengeFromVerifier(verifier),
  });
}

/**
 * Drop every cached ESI response for a character whose consent no longer
 * covers it. Called from `persistTokens` — the one funnel for both login and
 * refresh, and a portal-side revoke surfaces only in the refresh JWT.
 *
 * Triggers: a scope removed from the grant (widening is not a revocation, see
 * `esi/scopes.revokedScopes`); a changed `ownerHash` — character sold or
 * transferred, so the cached wallet/mail/assets are a different person's
 * (`sync/planSync.handleOwnerHashChange` purges too, but only during a
 * successful Firebase sync, which never happens when sync is unconfigured);
 * or an outstanding purge from an earlier grant, since the retry rides
 * entirely on that marker. An unknown prior grant is not a revocation: no
 * token record, a legacy record predating `scopes`, and an unseen character
 * all purge nothing.
 *
 * `requested` narrows the first trigger on the **login** path, where the app
 * chose what to ask for (issue #295). Incremental auth makes an ordinary
 * add-a-character login ask for the base set alone while some character on the
 * device holds more, so a scope the app never asked for is no evidence of
 * revocation and must not purge — the defect #293 first hit. The refresh path
 * requests nothing at all and passes `undefined`, keeping the stored grant as
 * its baseline; that is the only path a portal-side revoke arrives on, so
 * revocation detection is not weakened by any of this.
 *
 * Note what it is NOT: a plain `requested \ granted` diff. `SCOPES` asks for
 * the same set every login, so a scope SSO never returns — retired upstream,
 * or absent from the EVE application's own registration — would purge the
 * cache on every login forever. Only scopes the character actually *held* can
 * be lost, which is also the only case with a cache to protect.
 *
 * Runs before the record writes so suppression is in force before anything
 * downstream can read the cache. Neither call can fail the session:
 * `purgeCharacterCacheOrSuppress` degrades instead of throwing (tiers and the
 * trade in `esi/cachePurge.ts`), and `isCachePurgePending` is total by
 * contract even against a Dexie that throws synchronously
 * (`esi/cachePurgeLookupFailure.test.ts` pins it). A marker pending for
 * character A is not retried by B's refresh: A stays suppressed — an empty
 * offline view — until A itself logs in.
 *
 * Scope lists are compared, never logged; no token material here (ADR 0001).
 */
async function purgeCacheIfConsentChangedOrPending(
  decoded: DecodedAccessToken,
  existing: CharacterRecord | undefined,
  previousScopes: string[] | undefined,
  requested: string[] | undefined
): Promise<void> {
  const lost = Array.isArray(previousScopes) ? revokedScopes(previousScopes, decoded.scopes) : [];
  const scopeRevoked =
    requested === undefined ? lost.length > 0 : lost.some((scope) => requested.includes(scope));
  const ownerChanged = existing !== undefined && existing.ownerHash !== decoded.ownerHash;
  if (!scopeRevoked && !ownerChanged && !(await isCachePurgePending(decoded.characterId))) return;
  await purgeCharacterCacheOrSuppress(decoded.characterId);
}

/**
 * @param requestedScopes What this grant's authorize URL asked SSO for, or
 * `undefined` on the refresh path, which asks for nothing. See
 * `purgeCacheIfConsentChangedOrPending`.
 */
async function persistTokens(
  tokens: TokenResponse,
  requestedScopes?: string[]
): Promise<CharacterRecord> {
  const decoded = decodeAccessToken(tokens.access_token);
  const existing = await db.characters.get(decoded.characterId);
  const previous = await db.tokens.get(decoded.characterId);
  // SSO rotates the refresh token on most grants but MAY omit refresh_token
  // when it doesn't; overwriting with undefined would strand the session.
  const rotatedRefreshToken: string | undefined = tokens.refresh_token;
  const refreshTokenToStore = rotatedRefreshToken ?? previous?.refreshToken;
  if (refreshTokenToStore === undefined) {
    throw new Error('Token response omitted refresh_token and none is stored');
  }
  const character: CharacterRecord = {
    characterId: decoded.characterId,
    name: decoded.name,
    ownerHash: decoded.ownerHash,
    addedAt: existing?.addedAt ?? Date.now(),
    // Carried forward, not re-derived: the JWT has no corporation claim, so
    // rebuilding the record without this would reset the field to "not yet
    // learned" on every token refresh — leaving the corp trigger below looking
    // implemented while it silently never fired.
    ...(existing?.corporationId !== undefined ? { corporationId: existing.corporationId } : {}),
  };

  await purgeCacheIfConsentChangedOrPending(decoded, existing, previous?.scopes, requestedScopes);

  await db.characters.put(character);
  await db.tokens.put({
    characterId: decoded.characterId,
    accessToken: tokens.access_token,
    refreshToken: refreshTokenToStore,
    expiresAt: decoded.expiresAt,
    scopes: decoded.scopes,
  });
  return character;
}

/**
 * Record the corporation a character currently belongs to, purging the corp's
 * cached rows when that corporation has *changed*.
 *
 * The third consent trigger, alongside scope revocation and `ownerHash`
 * (issue #293), and the one the other two structurally cannot catch: a pilot
 * who joins a new corp is the same owner under the same grant, so both of the
 * checks in `purgeCacheIfConsentChangedOrPending` correctly stay silent.
 *
 * Called from `stores/publicInfo.ts` rather than from `persistTokens`, because
 * the corporation is not in the SSO JWT — `/characters/{id}/` is where it
 * comes from, and that is the read the store already performs. It lives in
 * this module all the same: it is a consent purge, and those belong next to
 * the other two rather than in a view store.
 *
 * Three deliberate non-events:
 * - **An unknown character** is a no-op. Writing a record here would invent a
 *   character that never signed in on this device.
 * - **An unchanged corporation** writes nothing at all, so a routine public-info
 *   refresh costs no Dexie write.
 * - **A first-ever corporation** (an upgraded record that predates the field)
 *   purges nothing: an unknown prior is not a change, exactly as an unknown
 *   prior grant is not a revocation.
 *
 * A failed purge is swallowed and the new corporation is recorded anyway. That
 * is safe only because `cache.corpCacheKey` puts the corporation id *in the
 * key*: undeleted rows are unreachable orphans under the old corp's key, never
 * data the new corp's reads could pick up. Note what is deliberately NOT done
 * here — `purgeCharacterCacheOrSuppress`, whose suppression tier blanks every
 * read for the character. Losing a pilot's skills and mail because they
 * changed corp is the regression this trigger exists to avoid, not a fallback.
 *
 * The final write is a re-checked `db.transaction`, not a bare `update()`,
 * for two reasons. First, correctness: `existing` above can go stale — a
 * token refresh (`persistTokens`) or a character removal
 * (`features/character/removeCharacter`) can land between that read and this
 * write. Re-reading inside the transaction closes the former (no stale
 * `corporationId` clobbers a refresh that just landed); `update`, not `put`,
 * already makes the latter safe on its own (a no-op on a since-deleted row,
 * never a resurrection) — the transaction just makes that guarantee atomic
 * with the read instead of leaving a window between them.
 *
 * Second — and what this was actually written to fix — a bare
 * `db.characters.update()` here races Dexie's `liveQuery` against any other
 * bare write landing on `characters` moments later. `Characters.tsx` calls
 * this (via `stores/publicInfo.ts`'s `load`) for every character it renders,
 * so the ordinary case is this write and `removeCharacter`'s
 * `db.characters.delete()` landing back-to-back the moment someone removes a
 * character whose corp just finished resolving. Two bare auto-transactions
 * on the same table, close enough together, left `useLiveQuery` emitting
 * once more with pre-delete data and then going silent — the removed
 * character stayed rendered until an unrelated table write jarred the
 * subscription loose (or the page reloaded). Scoping the write in an
 * explicit transaction closes that window too:
 * `Characters.test.tsx`'s "removes a character after confirmation" test
 * pins it. (Confirmed empirically: delaying the bare `update()` by a
 * microtask instead of transacting it did not fix the test — this is not a
 * timing coincidence.)
 */
export async function recordCharacterCorporation(
  characterId: number,
  corporationId: number
): Promise<void> {
  const existing = await db.characters.get(characterId);
  if (existing === undefined || existing.corporationId === corporationId) return;

  if (existing.corporationId !== undefined) {
    try {
      await purgeCorpScopedCache(characterId);
    } catch {
      // Orphans, not a leak — see above. They go with the next whole-cache
      // purge (revoke or owner change) rather than being retried here.
    }
  }
  await db.transaction('rw', db.characters, async () => {
    const current = await db.characters.get(characterId);
    if (current === undefined || current.corporationId === corporationId) return;
    await db.characters.update(characterId, { corporationId });
  });
}

/**
 * Every storage write here is best-effort. Storage can be full, or blocked
 * outright (private-mode webviews, "block site data"), and a throw from
 * `setItem` must not be what fails an otherwise good login.
 */
function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // A login that cannot stash cannot complete, but it fails at the callback
    // with a real reason rather than here with a storage exception.
  }
}

/** `null` for both "absent" and "unreadable" — neither can complete a login. */
function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to do; the entry is bounded by TTL and MAX_PENDING anyway.
  }
}

/** Keys of every pending round trip in this tab. */
function pendingKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PKCE_PREFIX)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

/** `expired` is separate so `prunePendingLogins` can tell "gone" from "stale". */
function readPendingLogin(key: string, allowExpired = false): PendingLogin | undefined {
  const raw = readStorage(key);
  if (raw === null) return undefined;
  let parsed: Partial<PendingLogin>;
  try {
    parsed = JSON.parse(raw) as Partial<PendingLogin>;
  } catch {
    return undefined;
  }
  if (typeof parsed.verifier !== 'string') return undefined;
  const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : 0;
  if (!allowExpired && Date.now() - createdAt > PENDING_TTL_MS) return undefined;
  return { verifier: parsed.verifier, scopes: asScopes(parsed.scopes), createdAt };
}

/** Drop expired round trips, then the oldest beyond `MAX_PENDING`. `keep` is never dropped. */
function prunePendingLogins(keep: string): void {
  const now = Date.now();
  const keepKey = PKCE_PREFIX + keep;
  const live: { key: string; createdAt: number }[] = [];
  for (const key of pendingKeys()) {
    if (key === keepKey) continue;
    const pending = readPendingLogin(key, true);
    if (!pending || now - pending.createdAt > PENDING_TTL_MS) {
      removeStorage(key);
      continue;
    }
    live.push({ key, createdAt: pending.createdAt });
  }
  live.sort((a, b) => b.createdAt - a.createdAt);
  for (const stale of live.slice(MAX_PENDING - 1)) removeStorage(stale.key);
}

/**
 * The legacy single-slot stash, for a login that left before this deploy.
 * Read once and cleared whatever the outcome — it cannot serve a second
 * callback, and leaving it would shadow the per-state store.
 */
function takeLegacyPending(state: string): PendingLogin | undefined {
  const expectedState = readStorage(STATE_KEY);
  const verifier = readStorage(VERIFIER_KEY);
  // Compared before it is cleared: a stray callback must not destroy a legacy
  // login still in flight, which is the only kind this path exists to finish.
  if (!expectedState || !verifier || expectedState !== state) return undefined;
  const rawScopes = readStorage(SCOPES_KEY);
  removeStorage(STATE_KEY);
  removeStorage(VERIFIER_KEY);
  removeStorage(SCOPES_KEY);
  return { verifier, scopes: parseScopes(rawScopes), createdAt: 0 };
}

/** Anything that is not a list of strings reads as "unknown" — see `PendingLogin`. */
function asScopes(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((scope) => typeof scope === 'string')
    ? value
    : undefined;
}

function parseScopes(raw: string | null): string[] | undefined {
  if (raw === null) return undefined;
  try {
    return asScopes(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/**
 * What a retry should ask SSO for, or `undefined` if this tab has no record of
 * a login to retry.
 *
 * The union of every live Pending Login first, and only then the single
 * `INTENT_KEY` slot. That slot holds the *most recent* request, so with two
 * round trips open at once — an Add Character and a corp grant, say — it
 * describes whichever started last, and retrying the other from it could ask
 * for less than it originally did. Under-asking is the failure that matters:
 * SSO issues a token carrying exactly what was requested, so a dropped scope
 * is a grant silently thrown away. Where a round trip is still live its own
 * scopes are exact, and the union cannot narrow any of them.
 */
export function scopesForRetry(): string[] | undefined {
  const live = pendingKeys().flatMap((key) => readPendingLogin(key)?.scopes ?? []);
  if (live.length > 0) return [...new Set(live)];
  return parseScopes(readStorage(INTENT_KEY));
}

/**
 * Spend one automatic-restart attempt, or `false` when none is left.
 *
 * No storage means no automatic retry: failing closed costs one manual press,
 * failing open risks the loop `RETRY_KEY` exists to bound.
 */
export function takeRetryBudget(): boolean {
  const spent = Number(readStorage(RETRY_KEY) ?? '0');
  if (!(spent < MAX_AUTO_RETRIES)) return false;
  const before = readStorage(RETRY_KEY);
  writeStorage(RETRY_KEY, String(spent + 1));
  return readStorage(RETRY_KEY) !== before;
}

/** Give back the automatic restarts — a user-initiated retry is not one. */
export function clearRetryBudget(): void {
  removeStorage(RETRY_KEY);
}

/**
 * Forget what there was to retry. Used on success, and on a cancelled sign-in
 * — where clearing the *budget* instead would re-arm the automatic restart and
 * leave the intent behind as fuel for it.
 */
export function clearLoginIntent(): void {
  removeStorage(INTENT_KEY);
}

/** Forget the last login's intent and its retries — call once it has succeeded. */
export function clearLoginRecovery(): void {
  clearLoginIntent();
  removeStorage(RETRY_KEY);
}

/** Handle the SSO callback: validate state, exchange code, persist character + token. */
export async function completeLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<CharacterRecord> {
  const { clientId } = resolveConfig(config);
  const key = PKCE_PREFIX + params.state;
  const pending = readPendingLogin(key) ?? takeLegacyPending(params.state);
  if (!pending) {
    // Told apart for the user's sake: another round trip still pending means
    // this callback lost a race, whereas none at all means the stash is spent
    // or this tab never started a login.
    throw pendingKeys().length > 0
      ? new LoginError('state-mismatch', 'SSO state mismatch')
      : new LoginError('no-login-in-progress', 'No login in progress');
  }
  // One-shot: the code is single-use, so a second callback must not re-exchange.
  removeStorage(key);

  const tokens = await exchangeCode({ clientId, code: params.code, verifier: pending.verifier });
  return persistTokens(tokens, pending.scopes);
}

// Single-flight per character: EVE rotates refresh tokens, so two concurrent
// refreshes with the same (now-burned) token would fail the second.
const inflightRefresh = new Map<number, Promise<string>>();

/**
 * Return a usable access token, refreshing (and persisting rotation) if near
 * expiry.
 *
 * The in-flight check is FIRST and synchronous, and the token record is read
 * INSIDE the single-flight task: reading it earlier could act on a snapshot
 * gone stale mid-refresh and re-send the rotated (burned) refresh token.
 */
export function getValidAccessToken(characterId: number, config?: SsoConfig): Promise<string> {
  const pending = inflightRefresh.get(characterId);
  if (pending) return pending;

  const { clientId } = resolveConfig(config);
  const task = (async () => {
    const record = await db.tokens.get(characterId);
    if (!record) throw new Error(`No token stored for character ${characterId}`);
    if (record.expiresAt - Date.now() > EXPIRY_BUFFER_MS) return record.accessToken;

    const tokens = await refreshToken({ clientId, refreshToken: record.refreshToken });
    await persistTokens(tokens);
    return tokens.access_token;
  })().finally(() => inflightRefresh.delete(characterId));
  inflightRefresh.set(characterId, task);
  return task;
}
