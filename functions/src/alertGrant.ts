// Alerts Grant custody (issue #3753, ADR 0020): save/delete logic for the one
// server-held EVE token — a refresh token scoped to notifications only. Pure of
// Firebase: the Firestore store, key, verifier and SSO revoke are injected, so
// it tests without an emulator (alertGrantStore.ts / index.ts wire the real
// ones). A token is never logged, never put in an error, never returned.

import { encryptRefreshToken, decryptRefreshToken } from './alertGrantCrypto.js';
import type { EveTokenClaims } from './verifyEveToken.js';

/** The only scope an Alerts Grant may carry. */
export const ALERTS_SCOPE = 'esi-characters.read_notifications.v1';

const REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';

/** `alertGrants/{characterId}` — function-only (firestore.rules denies clients). */
export interface AlertGrantDoc {
  /** AES-256-GCM blob, see alertGrantCrypto.ts. */
  encryptedRefreshToken: string;
  /** The client_id the token was issued to; SSO revoke needs it. */
  clientId: string;
  enabledAt: number;
  /** Highest notification_id already handled; the poller owns it. */
  highWaterId: number | null;
  /** Last ETag from `/notifications/`; the poller owns it. */
  etag: string | null;
  /** Every notification type seen for this Character; the poller owns it. */
  seenTypes: string[];
  status: 'active' | 'revoked';
}

export interface AlertGrantStore {
  get(characterId: number): Promise<AlertGrantDoc | null>;
  set(characterId: number, doc: AlertGrantDoc): Promise<void>;
  delete(characterId: number): Promise<void>;
}

export interface AlertGrantDeps {
  store: AlertGrantStore;
  key: Buffer;
  verify: (accessToken: string) => Promise<EveTokenClaims>;
  revoke: (clientId: string, refreshToken: string) => Promise<void>;
  now: () => number;
  /** Receives only messages and ids — never a token. */
  log: (message: string, data?: Record<string, unknown>) => void;
}

export type AlertGrantErrorCode = 'invalid-argument' | 'unauthenticated' | 'permission-denied';

export class AlertGrantError extends Error {
  constructor(
    readonly code: AlertGrantErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface SaveAlertGrantInput {
  accessToken: string;
  refreshToken: string;
}

export function parseSaveAlertGrantInput(data: unknown): SaveAlertGrantInput {
  const { accessToken, refreshToken } = (data ?? {}) as Record<string, unknown>;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new AlertGrantError('invalid-argument', 'accessToken (string) is required');
  }
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new AlertGrantError('invalid-argument', 'refreshToken (string) is required');
  }
  return { accessToken, refreshToken };
}

export async function saveAlertGrant(
  deps: AlertGrantDeps,
  input: SaveAlertGrantInput
): Promise<{ characterId: number; enabledAt: number }> {
  let claims: EveTokenClaims;
  try {
    claims = await deps.verify(input.accessToken);
  } catch (err) {
    deps.log('Alerts Grant access token rejected', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new AlertGrantError('unauthenticated', 'EVE access token rejected');
  }
  if (claims.scopes.length !== 1 || claims.scopes[0] !== ALERTS_SCOPE) {
    throw new AlertGrantError('permission-denied', `Token must carry only ${ALERTS_SCOPE}`);
  }

  const { characterId, clientId } = claims;
  const existing = await deps.store.get(characterId);
  const keep = existing?.status === 'active' ? existing : null;
  const doc: AlertGrantDoc = {
    encryptedRefreshToken: encryptRefreshToken(input.refreshToken, characterId, deps.key),
    clientId,
    enabledAt: keep?.enabledAt ?? deps.now(),
    highWaterId: keep?.highWaterId ?? null,
    etag: keep?.etag ?? null,
    seenTypes: keep?.seenTypes ?? [],
    status: 'active',
  };
  await deps.store.set(characterId, doc);

  // The replaced token is now orphaned; revoke it, best effort.
  if (existing) await revokeStored(deps, characterId, existing);
  return { characterId, enabledAt: doc.enabledAt };
}

/** Decrypt and revoke a stored token at SSO. False if it could not be done. */
async function revokeStored(
  deps: AlertGrantDeps,
  characterId: number,
  doc: AlertGrantDoc
): Promise<boolean> {
  try {
    const token = decryptRefreshToken(doc.encryptedRefreshToken, characterId, deps.key);
    await deps.revoke(doc.clientId, token);
    return true;
  } catch (err) {
    deps.log('Alerts Grant token revoke failed', {
      characterId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return false;
  }
}

/**
 * Delete the grant, then revoke its token at SSO. The doc goes first: a revoke
 * failure must never leave a token we meant to drop sitting in Firestore.
 */
export async function deleteAlertGrant(
  deps: AlertGrantDeps,
  characterId: number
): Promise<{ deleted: boolean; revoked: boolean }> {
  const doc = await deps.store.get(characterId);
  if (!doc) return { deleted: false, revoked: false };
  await deps.store.delete(characterId);
  return { deleted: true, revoked: await revokeStored(deps, characterId, doc) };
}

/** SSO token revocation for a public (PKCE) client: client_id in the form body. */
export async function revokeAtSso(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: clientId,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SSO revoke failed (${res.status})`);
}
