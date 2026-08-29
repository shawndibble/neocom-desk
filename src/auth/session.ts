// High-level SSO session flow: login start/complete and access-token supply.
// Refresh tokens live only in local IndexedDB (see src/db) — never sent
// anywhere except login.eveonline.com.

import { generateVerifier, challengeFromVerifier } from './pkce';
import { buildAuthorizeUrl, exchangeCode, refreshToken, type TokenResponse } from './sso';
import { decodeAccessToken } from './jwt';
import { db, type CharacterRecord } from '@/db';

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
