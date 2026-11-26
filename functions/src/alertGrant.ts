import { verifyAccessToken } from './actorAuth.js';
import { encryptRefreshToken, decryptRefreshToken } from './alertGrantCrypto.js';
import type { EveTokenClaims } from './verifyEveToken.js';

export const ALERTS_SCOPE = 'esi-characters.read_notifications.v1';
export const ALERTS_LOCATION_SCOPE = 'esi-location.read_location.v1';
export const ALERTS_MAIL_SCOPE = 'esi-mail.read_mail.v1';
const ALLOWED_SCOPES: ReadonlySet<string> = new Set([
  ALERTS_SCOPE,
  ALERTS_LOCATION_SCOPE,
  ALERTS_MAIL_SCOPE,
]);

export function grantCoversNearby(grant: Pick<AlertGrantDoc, 'scopes'>): boolean {
  return grant.scopes?.includes(ALERTS_LOCATION_SCOPE) === true;
}

export function grantCoversMail(grant: Pick<AlertGrantDoc, 'scopes'>): boolean {
  return grant.scopes?.includes(ALERTS_MAIL_SCOPE) === true;
}

const SSO_TIMEOUT_MS = 10_000;
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';

export interface AlertGrantDoc {
  encryptedRefreshToken: string;
  clientId: string;
  enabledAt: number;
  highWaterId: number | null;
  etag: string | null;
  seenTypes: string[];
  status: 'active' | 'revoked';
  scopes?: string[];
  mailHighWaterId?: number | null;
  mailEtag?: string | null;
  mailPushed?: string[];
  notificationsIdle?: boolean;
  nextPollAt?: number;
}

export interface AlertGrantStore {
  get(characterId: number): Promise<AlertGrantDoc | null>;
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
  key: () => Buffer;
  verify: (accessToken: string) => Promise<EveTokenClaims>;
  refresh: (clientId: string, refreshToken: string) => Promise<RefreshedTokens>;
  revoke: (clientId: string, refreshToken: string) => Promise<void>;
  now: () => number;
  log: (message: string, data?: Record<string, unknown>) => void;
  forgetNearby?: (characterId: number) => Promise<void>;
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
): Promise<{ characterId: number; enabledAt: number; nearby: boolean; mail: boolean }> {
  const supplied = await verifyAlertsToken(deps, input.accessToken);

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
  const scopes = [...claims.scopes].sort();
  const withMail = scopes.includes(ALERTS_MAIL_SCOPE);
  const keptMail = withMail && previousActive !== null && grantCoversMail(previousActive);
  const doc: AlertGrantDoc = {
    encryptedRefreshToken: encryptRefreshToken(refreshed.refreshToken, characterId, key),
    clientId,
    enabledAt: previousActive?.enabledAt ?? deps.now(),
    highWaterId: previousActive?.highWaterId ?? null,
    etag: previousActive?.etag ?? null,
    seenTypes: previousActive?.seenTypes ?? [],
    status: 'active',
    scopes,
    nextPollAt: 0,
    ...(previousActive?.notificationsIdle ? { notificationsIdle: true } : {}),
    ...(withMail
      ? {
          mailHighWaterId: keptMail ? (previousActive.mailHighWaterId ?? null) : null,
          mailEtag: keptMail ? (previousActive.mailEtag ?? null) : null,
          mailPushed: keptMail ? (previousActive.mailPushed ?? []) : [],
        }
      : {}),
  };
  await deps.store.set(characterId, doc);

  if (existing) {
    await revokeStored(deps, characterId, existing, refreshed.refreshToken);
  }
  return {
    characterId,
    enabledAt: doc.enabledAt,
    nearby: grantCoversNearby(doc),
    mail: grantCoversMail(doc),
  };
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
  const scopes = new Set(claims.scopes);
  if (
    scopes.size !== claims.scopes.length ||
    !scopes.has(ALERTS_SCOPE) ||
    [...scopes].some((scope) => !ALLOWED_SCOPES.has(scope))
  ) {
    throw new AlertGrantError(
      'permission-denied',
      `Token must carry ${ALERTS_SCOPE}, optionally with ${ALERTS_LOCATION_SCOPE} and ${ALERTS_MAIL_SCOPE}, and nothing else`
    );
  }
  return claims;
}

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

export async function deleteAlertGrant(
  deps: AlertGrantDeps,
  characterId: number
): Promise<{ deleted: boolean; revoked: boolean }> {
  const doc = await deps.store.get(characterId);
  if (!doc) return { deleted: false, revoked: false };
  await deps.store.delete(characterId);
  await deps.forgetNearby?.(characterId).catch((err: unknown) =>
    deps.log('Nearby state cleanup failed', {
      characterId,
      error: err instanceof Error ? err.name : 'unknown',
    })
  );
  return { deleted: true, revoked: await revokeStored(deps, characterId, doc) };
}

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

const SSO_DESCRIPTION_MAX = 200;

export function sanitiseSsoDescription(raw: string, submittedToken: string): string | undefined {
  const exact = submittedToken === '' ? raw : raw.split(submittedToken).join('[token]');
  const safe = exact
    .replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[token]')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[token]')
    .trim()
    .slice(0, SSO_DESCRIPTION_MAX);
  return safe === '' ? undefined : safe;
}

export class SsoRefreshError extends Error {
  constructor(
    readonly status: number,
    readonly invalidGrant: boolean,
    readonly description?: string
  ) {
    super(`SSO refresh failed (${status})`);
  }
}

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
    const body = (await res.json().catch(() => null)) as {
      error?: unknown;
      error_description?: unknown;
    } | null;
    const description =
      typeof body?.error_description === 'string' && body.error_description !== ''
        ? sanitiseSsoDescription(body.error_description, refreshToken)
        : undefined;
    throw new SsoRefreshError(res.status, body?.error === 'invalid_grant', description);
  }
  const json = (await res.json()) as { access_token?: unknown; refresh_token?: unknown };
  if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
    throw new Error('SSO refresh response malformed');
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}
