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
