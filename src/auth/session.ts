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

const VERIFIER_KEY = 'neocom.sso.verifier';
const STATE_KEY = 'neocom.sso.state';
/**
 * What the authorize URL asked SSO for, stashed for the callback to read.
 *
 * Alongside the PKCE verifier because it has the same lifetime — one authorize
 * round trip, this tab only — and the same failure mode if it outlives one:
 * `purgeCacheIfConsentChangedOrPending` would go on treating a stale request as
 * the baseline for grants it had nothing to do with.
 */
const SCOPES_KEY = 'neocom.sso.scopes';

/** Refresh when less than this remains on the access token. */
const EXPIRY_BUFFER_MS = 60_000;

function resolveConfig(config?: SsoConfig): { clientId: string; redirectUri: string } {
  return {
    clientId: config?.clientId ?? (import.meta.env.VITE_EVE_CLIENT_ID as string),
    redirectUri: config?.redirectUri ?? `${location.origin}${import.meta.env.BASE_URL}callback`,
  };
}

/** Stash PKCE verifier + state and return the URL to redirect the user to. */
export async function startLogin(scopes: string[], config?: SsoConfig): Promise<string> {
  const { clientId, redirectUri } = resolveConfig(config);
  const verifier = generateVerifier();
  const state = generateVerifier(); // independent 32-byte random value
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(SCOPES_KEY, JSON.stringify(scopes));
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
 * What `startLogin` asked for, or `undefined` if this tab has no record of it.
 *
 * `undefined` is not "asked for nothing" — it is "unknown", and the purge falls
 * back to comparing against the stored grant, exactly as it did before #295.
 * Anything unreadable (cleared storage, a hand-edited or truncated value)
 * answers `undefined` for the same reason: the conservative reading is the one
 * that still catches a revocation.
 */
function takeRequestedScopes(): string[] | undefined {
  const raw = sessionStorage.getItem(SCOPES_KEY);
  sessionStorage.removeItem(SCOPES_KEY);
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((scope) => typeof scope === 'string')) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/** Handle the SSO callback: validate state, exchange code, persist character + token. */
export async function completeLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<CharacterRecord> {
  const { clientId } = resolveConfig(config);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!expectedState || !verifier) throw new Error('No login in progress');
  if (params.state !== expectedState) throw new Error('SSO state mismatch');
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  const requestedScopes = takeRequestedScopes();

  const tokens = await exchangeCode({ clientId, code: params.code, verifier });
  return persistTokens(tokens, requestedScopes);
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
