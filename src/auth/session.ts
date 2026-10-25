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
import { ALERTS_LOCATION_SCOPE, ALERTS_SCOPE } from './alertsScope';
import { CORP_SYNC_SCOPES, FEEDER_SYNC_SCOPES } from './corpSyncScopes';

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
export const PENDING_TTL_MS = 15 * 60_000;
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
  /** Set when this round trip is not a device login — see {@link LoginIntent}. */
  intent?: LoginIntent;
}

/**
 * A round trip that must not become a device session (ADR 0020). An Alerts
 * Grant asks SSO for the notifications scope alone, and its refresh token goes
 * to the server, so landing it in `completeLogin` would replace that
 * Character's full-scope session with a token that can read nothing else.
 * `characterId` is the Settings row that was pressed; EVE's own page lets the
 * user pick any Character, so the callback compares.
 *
 * A Corp Tax Book sync grant (ADR 0025) is the same shape of round trip: its
 * refresh token goes to the server, never into a device session. `corporationId`
 * is the book it was pressed from.
 */
export type LoginIntent =
  | { kind: 'alerts'; characterId: number }
  | { kind: 'corpSync'; characterId: number; corporationId: number }
  | { kind: 'feederGrant'; characterId: number; inviteCode: string; requestedRatePct?: number };

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
export function startLogin(scopes: string[], config?: SsoConfig): Promise<string> {
  return beginLogin(scopes, config);
}

/**
 * An Alerts Grant round trip for one Character's Settings row: the
 * notifications scope, plus the location for nearby alerts (ADR 0027), marked
 * so the callback never persists it as a login. Leaves `INTENT_KEY` alone — a failed callback must not restart this
 * as a plain login, which would store the narrow token as the device session.
 */
export function startAlertsLogin(
  characterId: number,
  config?: SsoConfig,
  { nearby = false }: { nearby?: boolean } = {}
): Promise<string> {
  const scopes = nearby ? [ALERTS_SCOPE, ALERTS_LOCATION_SCOPE] : [ALERTS_SCOPE];
  return beginLogin(scopes, config, { kind: 'alerts', characterId });
}

/**
 * A Corp Tax Book sync grant round trip (ADR 0025) for one book editor and one
 * corporation: the grant's scopes only, marked so the callback never persists it
 * as a login. Like `startAlertsLogin`, it leaves `INTENT_KEY` alone.
 */
export function startCorpSyncLogin(
  characterId: number,
  corporationId: number,
  config?: SsoConfig
): Promise<string> {
  return beginLogin([...CORP_SYNC_SCOPES], config, {
    kind: 'corpSync',
    characterId,
    corporationId,
  });
}

/**
 * A moon owner's grant round trip (ADR 0025 amendment): the observer ledger
 * scope alone, picked on EVE's login screen by an Accountant Character that need
 * not be on this account. `characterId` is the signed-in Character that holds the
 * grant; the invite code and the optional requested rate ride along so they
 * survive the redirect. Like `startCorpSyncLogin`, it leaves `INTENT_KEY` alone.
 */
export function startFeederGrantLogin(
  characterId: number,
  inviteCode: string,
  requestedRatePct?: number,
  config?: SsoConfig
): Promise<string> {
  return beginLogin([...FEEDER_SYNC_SCOPES], config, {
    kind: 'feederGrant',
    characterId,
    inviteCode,
    ...(requestedRatePct === undefined ? {} : { requestedRatePct }),
  });
}

async function beginLogin(
  scopes: string[],
  config?: SsoConfig,
  intent?: LoginIntent
): Promise<string> {
  const { clientId, redirectUri } = resolveConfig(config);
  const verifier = generateVerifier();
  const state = generateVerifier(); // independent 32-byte random value
  const pending: PendingLogin = {
    verifier,
    scopes,
    createdAt: Date.now(),
    ...(intent ? { intent } : {}),
  };
  // Prune first: at quota, the write below would otherwise fail for room that
  // pruning was about to free. `state` is not yet written, so nothing is lost.
  prunePendingLogins(state);
  writeStorage(PKCE_PREFIX + state, JSON.stringify(pending));
  if (!intent) writeStorage(INTENT_KEY, JSON.stringify(scopes));
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
 * Whole-record equality: the same keys, each holding an equal value. A stored
 * record carrying a field the rebuilt one lacks is *not* equal, so the write
 * still happens and drops it, exactly as it did before this check existed.
 */
function sameRecord(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      sameRecord((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
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

  // Skipped when nothing changed — the usual refresh. Every `useLiveQuery`
  // over `db.characters` re-runs on any write to the table, whatever it wrote.
  if (!sameRecord(existing, character)) await db.characters.put(character);
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
  const intent = parsed.intent;
  return {
    verifier: parsed.verifier,
    scopes: asScopes(parsed.scopes),
    createdAt,
    ...(intent?.kind === 'alerts' && typeof intent.characterId === 'number'
      ? { intent: { kind: 'alerts', characterId: intent.characterId } satisfies LoginIntent }
      : intent?.kind === 'corpSync' &&
          typeof intent.characterId === 'number' &&
          typeof intent.corporationId === 'number'
        ? {
            intent: {
              kind: 'corpSync',
              characterId: intent.characterId,
              corporationId: intent.corporationId,
            } satisfies LoginIntent,
          }
        : intent?.kind === 'feederGrant' &&
            typeof intent.characterId === 'number' &&
            typeof intent.inviteCode === 'string'
          ? {
              intent: {
                kind: 'feederGrant',
                characterId: intent.characterId,
                inviteCode: intent.inviteCode,
                ...(typeof intent.requestedRatePct === 'number'
                  ? { requestedRatePct: intent.requestedRatePct }
                  : {}),
              } satisfies LoginIntent,
            }
          : {}),
  };
}

/** What a live round trip was started for, or `undefined` for an ordinary device login (or none). */
export function loginIntentFor(state: string): LoginIntent | undefined {
  return readPendingLogin(PKCE_PREFIX + state)?.intent;
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
  // An Alerts round trip is not a login to restart: see `startAlertsLogin`.
  const live = pendingKeys().flatMap((key) => {
    const pending = readPendingLogin(key);
    return pending?.intent ? [] : (pending?.scopes ?? []);
  });
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

/**
 * Resolve a callback's `state` to its Pending Login, or throw the reason it
 * has none. Told apart for the user's sake: another round trip still pending
 * means this callback lost a race, whereas none at all means the stash is
 * spent or this tab never started a login.
 */
function pendingForCallback(state: string): { key: string; pending: PendingLogin } {
  const key = PKCE_PREFIX + state;
  const pending = readPendingLogin(key) ?? takeLegacyPending(state);
  if (!pending) {
    throw pendingKeys().length > 0
      ? new LoginError('state-mismatch', 'SSO state mismatch')
      : new LoginError('no-login-in-progress', 'No login in progress');
  }
  return { key, pending };
}

/** Handle the SSO callback: validate state, exchange code, persist character + token. */
export async function completeLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<CharacterRecord> {
  const { clientId } = resolveConfig(config);
  const { key, pending } = pendingForCallback(params.state);
  // One-shot: the code is single-use, so a second callback must not re-exchange.
  removeStorage(key);
  // Refused before the exchange: persisting an Alerts token would replace the
  // Character's device session with one that can read only notifications.
  if (pending.intent) throw new LoginError('state-mismatch', 'Not a device login');

  const tokens = await exchangeCode({ clientId, code: params.code, verifier: pending.verifier });
  return persistTokens(tokens, pending.scopes);
}

/** What an Alerts round trip came back with. Nothing here has been stored. */
export interface AlertsLoginResult {
  /** The Settings row that was pressed. */
  expectedCharacterId: number;
  /** The Character the user actually authorized on EVE's page. */
  characterId: number;
  name: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Handle the callback of an Alerts round trip: exchange the code and decode
 * who authorized, and **store nothing** — no Character row, no token row. The
 * caller compares `characterId` with `expectedCharacterId` and, on a match,
 * hands the tokens to the server.
 */
export async function completeAlertsLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<AlertsLoginResult> {
  const { intent, ...result } = await completeIntentLogin(params, 'alerts', config);
  void intent;
  return result;
}

/** What a Corp Tax Book sync grant round trip came back with. Nothing here has been stored. */
export interface CorpSyncLoginResult extends AlertsLoginResult {
  /** The book the grant was pressed from. */
  corporationId: number;
}

/** Handle the callback of a sync grant round trip: like `completeAlertsLogin`, storing nothing. */
export async function completeCorpSyncLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<CorpSyncLoginResult> {
  const { intent, ...result } = await completeIntentLogin(params, 'corpSync', config);
  return { ...result, corporationId: (intent as { corporationId: number }).corporationId };
}

/** What a moon owner's grant round trip came back with. Nothing here has been stored. */
export interface FeederGrantLoginResult extends AlertsLoginResult {
  inviteCode: string;
  requestedRatePct?: number;
}

/** Handle the callback of a moon owner's grant round trip: like `completeCorpSyncLogin`, storing nothing. */
export async function completeFeederGrantLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<FeederGrantLoginResult> {
  const { intent, ...result } = await completeIntentLogin(params, 'feederGrant', config);
  const { inviteCode, requestedRatePct } = intent as Extract<LoginIntent, { kind: 'feederGrant' }>;
  return { ...result, inviteCode, ...(requestedRatePct === undefined ? {} : { requestedRatePct }) };
}

async function completeIntentLogin(
  params: { code: string; state: string },
  kind: LoginIntent['kind'],
  config?: SsoConfig
): Promise<AlertsLoginResult & { intent: LoginIntent }> {
  const { clientId } = resolveConfig(config);
  const { key, pending } = pendingForCallback(params.state);
  removeStorage(key);
  if (pending.intent?.kind !== kind)
    throw new LoginError('state-mismatch', 'Not this kind of login');

  const tokens = await exchangeCode({ clientId, code: params.code, verifier: pending.verifier });
  if (!tokens.refresh_token) throw new Error('Token response omitted refresh_token');
  const decoded = decodeAccessToken(tokens.access_token);
  return {
    intent: pending.intent,
    expectedCharacterId: pending.intent.characterId,
    characterId: decoded.characterId,
    name: decoded.name,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  };
}

// Single-flight per character, in this tab and — through Web Locks — across
// tabs. EVE's docs say the refresh token "may not be the same" after a refresh
// and that rotation is coming for native (PKCE) clients like this one; they
// don't say whether the old token dies on use. If it does, two concurrent
// refreshes with one token would fail the second as `invalid_grant`, which
// reads as a dead grant (`app/tokenProvider.ts`). Serialising is cheap
// insurance either way, and saves the duplicate round trip.
const inflightRefresh = new Map<number, Promise<string>>();

/**
 * Runs `task` holding this character's refresh lock, so only one tab at a time
 * reads-then-rotates its token row. Where Web Locks don't exist, runs it
 * directly: the in-tab single flight still holds.
 */
function withRefreshLock<T>(characterId: number, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return task();
  return locks.request(`neocom:refresh:${characterId}`, task);
}

/**
 * Return a usable access token, refreshing (and persisting rotation) if near
 * expiry.
 *
 * The in-flight check is FIRST and synchronous, and the token record is read
 * INSIDE the single-flight task — and inside the cross-tab lock: reading it
 * earlier could act on a snapshot gone stale mid-refresh (here or in another
 * tab) and re-send the rotated refresh token. A tab that waited on the lock
 * reads the row the winner just wrote, finds it fresh, and returns it.
 */
export function getValidAccessToken(characterId: number, config?: SsoConfig): Promise<string> {
  const pending = inflightRefresh.get(characterId);
  if (pending) return pending;

  const { clientId } = resolveConfig(config);
  const task = withRefreshLock(characterId, async () => {
    const record = await db.tokens.get(characterId);
    if (!record) throw new Error(`No token stored for character ${characterId}`);
    if (record.expiresAt - Date.now() > EXPIRY_BUFFER_MS) return record.accessToken;

    const tokens = await refreshToken({ clientId, refreshToken: record.refreshToken });
    await persistTokens(tokens);
    return tokens.access_token;
  }).finally(() => inflightRefresh.delete(characterId));
  inflightRefresh.set(characterId, task);
  return task;
}
