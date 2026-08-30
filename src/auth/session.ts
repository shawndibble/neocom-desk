// High-level SSO session flow: login start/complete and access-token supply.
// Refresh tokens live only in local IndexedDB (see src/db) — never sent
// anywhere except login.eveonline.com.

import { generateVerifier, challengeFromVerifier } from './pkce';
import { buildAuthorizeUrl, exchangeCode, refreshToken, type TokenResponse } from './sso';
import { decodeAccessToken, type DecodedAccessToken } from './jwt';
import { db, type CharacterRecord } from '@/db';
import { isCachePurgePending, purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import { revokedScopes } from '@/esi/scopes';

export interface SsoConfig {
  clientId?: string;
  redirectUri?: string;
}

const VERIFIER_KEY = 'neocom.sso.verifier';
const STATE_KEY = 'neocom.sso.state';

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
 * covers it. Two triggers are readable from the grant we just received:
 *
 *  - **A scope was removed.** Re-authorizing with fewer scopes, or revoking in
 *    EVE's third-party-app portal, means the user withdrew permission for data
 *    we may still be holding. Only *removals* count: a wider grant is not a
 *    revocation and must stay a no-op, or shipping a new scope would wipe
 *    every user's cache on their next login.
 *  - **The ownerHash changed.** EVE re-hashes it when a character is sold or
 *    transferred, so the cached wallet/mail/assets belong to a *different
 *    person*. `sync/planSync.handleOwnerHashChange` also purges, but only
 *    during a successful Firebase sync — which never happens when sync is
 *    unconfigured. Login/refresh always happens, so this is the reliable
 *    checkpoint; the sync-side purge still covers a transfer noticed between
 *    logins.
 *
 * A third trigger is an *outstanding* purge — one an earlier grant could not
 * complete. See the retry note below.
 *
 * Absent prior state is *not* a revocation: no token record at all (first
 * login) and a legacy record written before `scopes` existed both mean "prior
 * grant unknown", and an unknown prior grant purges nothing. Same for a
 * character we have never seen — there is no previous owner to protect.
 *
 * **A failing purge must never fail the session.** A Dexie hiccup (quota,
 * damaged store, private browsing) would otherwise lock the user out of the
 * whole app, so `purgeCharacterCacheOrSuppress` degrades instead of throwing —
 * escalating to a full-table clear and, if even that fails, to suppressing the
 * character's cache reads (see `esi/cachePurge.ts` for the tiers and the
 * trade). It never returns a failure worth acting on here.
 *
 * That moves where the RETRY lives. The purge used to be allowed to throw
 * before the record writes, so the stale scope set / ownerHash stayed on disk
 * as evidence and the next grant re-detected the revocation. Now the writes
 * always happen and that evidence is gone after the first attempt: the retry
 * rides entirely on the purge-pending marker, which is why this runs on every
 * grant where one is outstanding, not only when consent changed. The purge
 * still runs before the writes — now so suppression is in force before
 * anything downstream can read the cache, not to preserve evidence.
 *
 * `isCachePurgePending` is awaited unguarded below because it is a total
 * function by contract (`esi/cachePurgeLookupFailure.test.ts` pins that): even
 * a Dexie that throws on the marker lookup resolves to "not pending" rather
 * than taking the session down.
 *
 * A marker pending for character A is not retried by character B's refresh:
 * A simply stays suppressed (safe — an empty offline view) until A itself
 * logs in or refreshes. That is the right trade; a retry-all sweep would buy
 * nothing but complexity.
 *
 * Scope lists are not secret and are compared, never logged; token material is
 * not touched here (ADR 0001).
 */
async function purgeCacheIfConsentChangedOrPending(
  decoded: DecodedAccessToken,
  existing: CharacterRecord | undefined,
  previousScopes: string[] | undefined
): Promise<void> {
  const scopeRevoked =
    Array.isArray(previousScopes) && revokedScopes(previousScopes, decoded.scopes).length > 0;
  const ownerChanged = existing !== undefined && existing.ownerHash !== decoded.ownerHash;
  if (!scopeRevoked && !ownerChanged && !(await isCachePurgePending(decoded.characterId))) return;
  await purgeCharacterCacheOrSuppress(decoded.characterId);
}

async function persistTokens(tokens: TokenResponse): Promise<CharacterRecord> {
  const decoded = decodeAccessToken(tokens.access_token);
  const existing = await db.characters.get(decoded.characterId);
  const previous = await db.tokens.get(decoded.characterId);
  // SSO rotates the refresh token on most grants but MAY omit refresh_token
  // from the response when it doesn't — keep the stored one in that case.
  // Overwriting with undefined would strand the session.
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
  };

  await purgeCacheIfConsentChangedOrPending(decoded, existing, previous?.scopes);

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

  const tokens = await exchangeCode({ clientId, code: params.code, verifier });
  return persistTokens(tokens);
}

// Single-flight per character: EVE rotates refresh tokens, so two concurrent
// refreshes with the same (now-burned) token would fail the second.
const inflightRefresh = new Map<number, Promise<string>>();

/**
 * Return a usable access token, refreshing (and persisting rotation) if near
 * expiry.
 *
 * Ordering matters: the in-flight check happens FIRST (synchronously), and the
 * token record is read INSIDE the single-flight task. A caller that read the
 * record before checking for an in-flight refresh could act on a stale
 * snapshot after that refresh completed — and re-send the rotated (burned)
 * refresh token to the SSO.
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
