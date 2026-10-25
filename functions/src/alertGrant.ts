// Alerts Grant custody (issue #3753, ADR 0020, ADR 0027): save/delete logic for
// the one server-held EVE token — a refresh token scoped to notifications and,
// when the user granted it for nearby alerts, the Character's location. Pure of
// Firebase: the Firestore store, key, verifier and SSO revoke are injected, so
// it tests without an emulator (alertGrantStore.ts / index.ts wire the real
// ones). A token is never logged, never put in an error, never returned.

import { verifyAccessToken } from './actorAuth.js';
import { encryptRefreshToken, decryptRefreshToken } from './alertGrantCrypto.js';
import type { EveTokenClaims } from './verifyEveToken.js';

/** The scope every Alerts Grant carries. */
export const ALERTS_SCOPE = 'esi-characters.read_notifications.v1';
/**
 * The one optional extra (ADR 0027): the Character's location, so the poller
 * can push nearby Incursions and raidable skyhooks. A grant saved before it
 * existed holds the notifications scope alone and keeps working for that.
 */
export const ALERTS_LOCATION_SCOPE = 'esi-location.read_location.v1';
const ALLOWED_SCOPES: ReadonlySet<string> = new Set([ALERTS_SCOPE, ALERTS_LOCATION_SCOPE]);

/** Whether a grant's token can read the Character's location (absent `scopes`: saved before ADR 0027). */
export function grantCoversNearby(grant: Pick<AlertGrantDoc, 'scopes'>): boolean {
  return grant.scopes?.includes(ALERTS_LOCATION_SCOPE) === true;
}

const SSO_TIMEOUT_MS = 10_000;
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
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
  /**
   * The scopes the stored token carries, sorted (ADR 0027). Absent on a grant
   * saved before the location scope existed, which means notifications only.
   */
  scopes?: string[];
}

export interface AlertGrantStore {
  get(characterId: number): Promise<AlertGrantDoc | null>;
  /** One round trip for many Characters; a Character with no grant maps to null. */
  getMany(characterIds: number[]): Promise<Map<number, AlertGrantDoc | null>>;
  set(characterId: number, doc: AlertGrantDoc): Promise<void>;
  delete(characterId: number): Promise<void>;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AlertGrantDeps {
  store: AlertGrantStore;
  /** Lazy: a missing secret must only fail calls that actually need the key. */
  key: () => Buffer;
  verify: (accessToken: string) => Promise<EveTokenClaims>;
  /** Exchange a refresh token at SSO; returns the new access token and the rotated refresh token. */
  refresh: (clientId: string, refreshToken: string) => Promise<RefreshedTokens>;
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
): Promise<{ characterId: number; enabledAt: number; nearby: boolean }> {
  const supplied = await verifyAlertsToken(deps, input.accessToken);

  // The access token alone proves nothing about the refresh token beside it:
  // anyone holding a stolen access token could otherwise swap in their own.
  // Redeeming the refresh token at SSO proves it is a live token for this same
  // Character, and hands back the rotated one, which is the one to store.
  let refreshed: RefreshedTokens;
  try {
    refreshed = await deps.refresh(supplied.clientId, input.refreshToken);
  } catch (err) {
    deps.log('Alerts Grant refresh token rejected', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new AlertGrantError('unauthenticated', 'EVE refresh token rejected');
  }
  const claims = await verifyAlertsToken(deps, refreshed.accessToken);
  if (claims.characterId !== supplied.characterId) {
    throw new AlertGrantError('permission-denied', 'Refresh token belongs to another Character');
  }

  const { characterId, clientId } = claims;
  const key = deps.key();
  const existing = await deps.store.get(characterId);
  const previousActive = existing?.status === 'active' ? existing : null;
  const doc: AlertGrantDoc = {
    encryptedRefreshToken: encryptRefreshToken(refreshed.refreshToken, characterId, key),
    clientId,
    enabledAt: previousActive?.enabledAt ?? deps.now(),
    highWaterId: previousActive?.highWaterId ?? null,
    etag: previousActive?.etag ?? null,
    seenTypes: previousActive?.seenTypes ?? [],
    status: 'active',
    scopes: [...claims.scopes].sort(),
  };
  await deps.store.set(characterId, doc);

  // The replaced token is now orphaned; revoke it, best effort. The refresh
  // above usually rotated it already, so skip if it is the one just stored.
  if (existing) {
    await revokeStored(deps, characterId, existing, refreshed.refreshToken);
  }
  return { characterId, enabledAt: doc.enabledAt, nearby: grantCoversNearby(doc) };
}

async function verifyAlertsToken(
  deps: AlertGrantDeps,
  accessToken: string
): Promise<EveTokenClaims> {
  const claims = await verifyAccessToken(deps.verify, accessToken, {
    onReject: (err) =>
      deps.log('Alerts Grant access token rejected', {
        error: err instanceof Error ? err.message : 'unknown',
      }),
    toError: () => new AlertGrantError('unauthenticated', 'EVE access token rejected'),
  });
  // Notifications, optionally with location; nothing else, and no repeats.
  const scopes = new Set(claims.scopes);
  if (
    scopes.size !== claims.scopes.length ||
    !scopes.has(ALERTS_SCOPE) ||
    [...scopes].some((scope) => !ALLOWED_SCOPES.has(scope))
  ) {
    throw new AlertGrantError(
      'permission-denied',
      `Token must carry ${ALERTS_SCOPE}, optionally with ${ALERTS_LOCATION_SCOPE}, and nothing else`
    );
  }
  return claims;
}

/** Decrypt and revoke a stored token at SSO (unless it equals `keepToken`). False if it could not be done. */
async function revokeStored(
  deps: AlertGrantDeps,
  characterId: number,
  doc: AlertGrantDoc,
  keepToken?: string
): Promise<boolean> {
  try {
    const token = decryptRefreshToken(doc.encryptedRefreshToken, characterId, deps.key());
    if (token === keepToken) return true;
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
    signal: AbortSignal.timeout(SSO_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SSO revoke failed (${res.status})`);
}

/** An SSO refresh refusal. Carries the status and error code only — never a token. */
export class SsoRefreshError extends Error {
  constructor(
    readonly status: number,
    /** True when SSO answered `invalid_grant`: the token is dead (revoked, expired, wrong client). */
    readonly invalidGrant: boolean
  ) {
    super(`SSO refresh failed (${status})`);
  }
}

/** Refresh-token grant for a public (PKCE) client. Errors carry the status only. */
export async function refreshAtSso(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<RefreshedTokens> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
    signal: AbortSignal.timeout(SSO_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new SsoRefreshError(res.status, body?.error === 'invalid_grant');
  }
  const json = (await res.json()) as { access_token?: unknown; refresh_token?: unknown };
  if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
    throw new Error('SSO refresh response malformed');
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}
