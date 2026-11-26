import { generateVerifier, challengeFromVerifier } from './pkce';
import {
  AuthError,
  buildAuthorizeUrl,
  exchangeCode,
  refreshToken,
  type TokenResponse,
} from './sso';
import { emitDeadGrant } from './deadGrantSignal';
import { decodeAccessToken, type DecodedAccessToken } from './jwt';
import { db, type CharacterRecord } from '@/db';
import {
  isCachePurgePending,
  purgeCharacterCacheOrSuppress,
  purgeCorpScopedCache,
} from '@/esi/cachePurge';
import { revokedScopes } from '@/esi/scopes';
import { ALERTS_LOCATION_SCOPE, ALERTS_MAIL_SCOPE, ALERTS_SCOPE } from './alertsScope';
import { CORP_SYNC_SCOPES, FEEDER_SYNC_SCOPES } from './corpSyncScopes';
import { VETTING_SCOPES } from './vettingScopes';

export interface SsoConfig {
  clientId?: string;
  redirectUri?: string;
}

const PKCE_PREFIX = 'neocom.sso.pkce.';

const VERIFIER_KEY = 'neocom.sso.verifier';
const STATE_KEY = 'neocom.sso.state';
const SCOPES_KEY = 'neocom.sso.scopes';

const INTENT_KEY = 'neocom.sso.intent';

export const PENDING_TTL_MS = 15 * 60_000;
const MAX_PENDING = 5;

const RETRY_KEY = 'neocom.sso.autoRetries';
const MAX_AUTO_RETRIES = 1;

interface PendingLogin {
  verifier: string;
  scopes: string[] | undefined;
  createdAt: number;
  intent?: LoginIntent;
}

export type LoginIntent =
  | { kind: 'alerts'; characterId: number }
  | { kind: 'corpSync'; characterId: number; corporationId: number }
  | { kind: 'feederGrant'; characterId: number; inviteCode: string; requestedRatePct?: number }
  | {
      kind: 'ownCorpGrant';
      characterId: number;
      expectedCeoCharacterId: number;
      collectorCorporationId: number;
      feederCorporationId: number;
      coverageFrom?: string;
    }
  | { kind: 'vetting'; corporationId: number; reviewId?: string };

export type LoginFailureReason = 'no-login-in-progress' | 'state-mismatch';

export class LoginError extends Error {
  constructor(
    readonly reason: LoginFailureReason,
    message: string
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

const EXPIRY_BUFFER_MS = 60_000;

function resolveConfig(config?: SsoConfig): { clientId: string; redirectUri: string } {
  return {
    clientId: config?.clientId ?? (import.meta.env.VITE_EVE_CLIENT_ID as string),
    redirectUri: config?.redirectUri ?? `${location.origin}${import.meta.env.BASE_URL}callback`,
  };
}

export function startLogin(scopes: string[], config?: SsoConfig): Promise<string> {
  return beginLogin(scopes, config);
}

export function startAlertsLogin(
  characterId: number,
  config?: SsoConfig,
  { nearby = false, mail = false }: { nearby?: boolean; mail?: boolean } = {}
): Promise<string> {
  const scopes = [
    ALERTS_SCOPE,
    ...(nearby ? [ALERTS_LOCATION_SCOPE] : []),
    ...(mail ? [ALERTS_MAIL_SCOPE] : []),
  ];
  return beginLogin(scopes, config, { kind: 'alerts', characterId });
}

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

export function startOwnCorpGrantLogin(
  intent: Omit<Extract<LoginIntent, { kind: 'ownCorpGrant' }>, 'kind'>,
  config?: SsoConfig
): Promise<string> {
  return beginLogin([...FEEDER_SYNC_SCOPES], config, { kind: 'ownCorpGrant', ...intent });
}

export function startVettingLogin(
  corporationId: number,
  reviewId?: string,
  config?: SsoConfig
): Promise<string> {
  return beginLogin([...VETTING_SCOPES], config, {
    kind: 'vetting',
    corporationId,
    ...(reviewId === undefined ? {} : { reviewId }),
  });
}

async function beginLogin(
  scopes: string[],
  config?: SsoConfig,
  intent?: LoginIntent
): Promise<string> {
  const { clientId, redirectUri } = resolveConfig(config);
  const verifier = generateVerifier();
  const state = generateVerifier();
  const pending: PendingLogin = {
    verifier,
    scopes,
    createdAt: Date.now(),
    ...(intent ? { intent } : {}),
  };
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

async function persistTokens(
  tokens: TokenResponse,
  requestedScopes?: string[]
): Promise<CharacterRecord> {
  const decoded = decodeAccessToken(tokens.access_token);
  const existing = await db.characters.get(decoded.characterId);
  const previous = await db.tokens.get(decoded.characterId);
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
    ...(existing?.corporationId !== undefined ? { corporationId: existing.corporationId } : {}),
  };

  await purgeCacheIfConsentChangedOrPending(decoded, existing, previous?.scopes, requestedScopes);

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

export async function recordCharacterCorporation(
  characterId: number,
  corporationId: number
): Promise<void> {
  const existing = await db.characters.get(characterId);
  if (existing === undefined || existing.corporationId === corporationId) return;

  if (existing.corporationId !== undefined) {
    try {
      await purgeCorpScopedCache(characterId);
    } catch {}
  }
  await db.transaction('rw', db.characters, async () => {
    const current = await db.characters.get(characterId);
    if (current === undefined || current.corporationId === corporationId) return;
    await db.characters.update(characterId, { corporationId });
  });
}

function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

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
  } catch {}
}

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
          : intent?.kind === 'ownCorpGrant' &&
              typeof intent.characterId === 'number' &&
              typeof intent.expectedCeoCharacterId === 'number' &&
              typeof intent.collectorCorporationId === 'number' &&
              typeof intent.feederCorporationId === 'number'
            ? {
                intent: {
                  kind: 'ownCorpGrant',
                  characterId: intent.characterId,
                  expectedCeoCharacterId: intent.expectedCeoCharacterId,
                  collectorCorporationId: intent.collectorCorporationId,
                  feederCorporationId: intent.feederCorporationId,
                  ...(typeof intent.coverageFrom === 'string'
                    ? { coverageFrom: intent.coverageFrom }
                    : {}),
                } satisfies LoginIntent,
              }
            : intent?.kind === 'vetting' && typeof intent.corporationId === 'number'
              ? {
                  intent: {
                    kind: 'vetting',
                    corporationId: intent.corporationId,
                    ...(typeof intent.reviewId === 'string' ? { reviewId: intent.reviewId } : {}),
                  } satisfies LoginIntent,
                }
              : {}),
  };
}

export function loginIntentFor(state: string): LoginIntent | undefined {
  return readPendingLogin(PKCE_PREFIX + state)?.intent;
}

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

function takeLegacyPending(state: string): PendingLogin | undefined {
  const expectedState = readStorage(STATE_KEY);
  const verifier = readStorage(VERIFIER_KEY);
  if (!expectedState || !verifier || expectedState !== state) return undefined;
  const rawScopes = readStorage(SCOPES_KEY);
  removeStorage(STATE_KEY);
  removeStorage(VERIFIER_KEY);
  removeStorage(SCOPES_KEY);
  return { verifier, scopes: parseScopes(rawScopes), createdAt: 0 };
}

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

export function scopesForRetry(): string[] | undefined {
  const live = pendingKeys().flatMap((key) => {
    const pending = readPendingLogin(key);
    return pending?.intent ? [] : (pending?.scopes ?? []);
  });
  if (live.length > 0) return [...new Set(live)];
  return parseScopes(readStorage(INTENT_KEY));
}

export function takeRetryBudget(): boolean {
  const spent = Number(readStorage(RETRY_KEY) ?? '0');
  if (!(spent < MAX_AUTO_RETRIES)) return false;
  const before = readStorage(RETRY_KEY);
  writeStorage(RETRY_KEY, String(spent + 1));
  return readStorage(RETRY_KEY) !== before;
}

export function clearRetryBudget(): void {
  removeStorage(RETRY_KEY);
}

export function clearLoginIntent(): void {
  removeStorage(INTENT_KEY);
}

export function clearLoginRecovery(): void {
  clearLoginIntent();
  removeStorage(RETRY_KEY);
}

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

export async function completeLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<CharacterRecord> {
  const { clientId } = resolveConfig(config);
  const { key, pending } = pendingForCallback(params.state);
  removeStorage(key);
  if (pending.intent) throw new LoginError('state-mismatch', 'Not a device login');

  const tokens = await exchangeCode({ clientId, code: params.code, verifier: pending.verifier });
  return persistTokens(tokens, pending.scopes);
}

export interface AlertsLoginResult {
  expectedCharacterId: number;
  characterId: number;
  name: string;
  accessToken: string;
  refreshToken: string;
}

export async function completeAlertsLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<AlertsLoginResult> {
  const { intent, ...result } = await completeIntentLogin(params, 'alerts', config);
  void intent;
  return result;
}

export interface CorpSyncLoginResult extends AlertsLoginResult {
  corporationId: number;
}

export async function completeCorpSyncLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<CorpSyncLoginResult> {
  const { intent, ...result } = await completeIntentLogin(params, 'corpSync', config);
  return { ...result, corporationId: (intent as { corporationId: number }).corporationId };
}

export interface FeederGrantLoginResult extends AlertsLoginResult {
  inviteCode: string;
  requestedRatePct?: number;
}

export async function completeFeederGrantLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<FeederGrantLoginResult> {
  const { intent, ...result } = await completeIntentLogin(params, 'feederGrant', config);
  const { inviteCode, requestedRatePct } = intent as Extract<LoginIntent, { kind: 'feederGrant' }>;
  return { ...result, inviteCode, ...(requestedRatePct === undefined ? {} : { requestedRatePct }) };
}

export interface OwnCorpGrantLoginResult extends AlertsLoginResult {
  expectedCeoCharacterId: number;
  collectorCorporationId: number;
  feederCorporationId: number;
  coverageFrom?: string;
}

export async function completeOwnCorpGrantLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<OwnCorpGrantLoginResult> {
  const { intent, ...result } = await completeIntentLogin(params, 'ownCorpGrant', config);
  const { expectedCeoCharacterId, collectorCorporationId, feederCorporationId, coverageFrom } =
    intent as Extract<LoginIntent, { kind: 'ownCorpGrant' }>;
  return {
    ...result,
    expectedCeoCharacterId,
    collectorCorporationId,
    feederCorporationId,
    ...(coverageFrom === undefined ? {} : { coverageFrom }),
  };
}

export interface VettingLoginResult {
  corporationId: number;
  reviewId?: string;
  characterId: number;
  name: string;
  accessToken: string;
}

export async function completeVettingLogin(
  params: { code: string; state: string },
  config?: SsoConfig
): Promise<VettingLoginResult> {
  const { clientId } = resolveConfig(config);
  const { key, pending } = pendingForCallback(params.state);
  removeStorage(key);
  const intent = pending.intent;
  if (intent?.kind !== 'vetting') throw new LoginError('state-mismatch', 'Not this kind of login');

  const tokens = await exchangeCode({ clientId, code: params.code, verifier: pending.verifier });
  const decoded = decodeAccessToken(tokens.access_token);
  return {
    corporationId: intent.corporationId,
    ...(intent.reviewId === undefined ? {} : { reviewId: intent.reviewId }),
    characterId: decoded.characterId,
    name: decoded.name,
    accessToken: tokens.access_token,
  };
}

type CharacterIntent = Exclude<LoginIntent, { kind: 'vetting' }>;

async function completeIntentLogin(
  params: { code: string; state: string },
  kind: CharacterIntent['kind'],
  config?: SsoConfig
): Promise<AlertsLoginResult & { intent: CharacterIntent }> {
  const { clientId } = resolveConfig(config);
  const { key, pending } = pendingForCallback(params.state);
  removeStorage(key);
  const intent = pending.intent;
  if (!intent || intent.kind === 'vetting' || intent.kind !== kind)
    throw new LoginError('state-mismatch', 'Not this kind of login');

  const tokens = await exchangeCode({ clientId, code: params.code, verifier: pending.verifier });
  if (!tokens.refresh_token) throw new Error('Token response omitted refresh_token');
  const decoded = decodeAccessToken(tokens.access_token);
  return {
    intent,
    expectedCharacterId: intent.characterId,
    characterId: decoded.characterId,
    name: decoded.name,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  };
}

const inflightRefresh = new Map<number, Promise<string>>();

function withRefreshLock<T>(characterId: number, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return task();
  return locks.request(`neocom:refresh:${characterId}`, task);
}

export function getValidAccessToken(characterId: number, config?: SsoConfig): Promise<string> {
  const pending = inflightRefresh.get(characterId);
  if (pending) return pending;

  const { clientId } = resolveConfig(config);
  const task = withRefreshLock(characterId, async () => {
    const record = await db.tokens.get(characterId);
    if (!record) throw new Error(`No token stored for character ${characterId}`);
    if (record.expiresAt - Date.now() > EXPIRY_BUFFER_MS) return record.accessToken;

    let tokens: TokenResponse;
    try {
      tokens = await refreshToken({ clientId, refreshToken: record.refreshToken });
    } catch (err) {
      if (err instanceof AuthError && err.code === 'invalid_grant') emitDeadGrant(characterId);
      throw err;
    }
    await persistTokens(tokens);
    return tokens.access_token;
  }).finally(() => inflightRefresh.delete(characterId));
  inflightRefresh.set(characterId, task);
  return task;
}
