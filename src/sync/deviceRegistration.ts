import { deleteToken, getMessaging, getToken } from 'firebase/messaging';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import type { ProjectionRow } from '@/engine/projection';
import { getFirebaseApp } from './firebaseApp';
import { callRouted } from './routedCallable';
import { getDeviceId } from './deviceId';
import { readLocal, removeLocal, writeLocal } from '@/lib/safeLocalStorage';
import type { QuietHoursPayload } from '@/features/notifications/quietTime';
import type { ServerEventRegistration } from '@/features/notifications/serverEvents';
import type { RouteRules } from '@/features/route/routeRules';
import { HOUR_MS } from '@/lib/age';

interface RegisterDeviceResponse {
  deviceId: string;
  registered: number[];
  rejected: number[];
  seenTypes?: Record<string, string[]>;
  nearbyGrants?: number[];
  mailGrants?: number[];
}

const NO_PROJECTION_ROWS: readonly ProjectionRow[] = [];
const NO_EVE_TYPES: readonly string[] = [];
const NO_SERVER_EVENTS: ServerEventRegistration = { serverEvents: [], serverInputs: {} };

export const REREGISTER_AFTER_MS = HOUR_MS;

const LAST_REGISTRATION_KEY = 'neocom.lastPushRegistration';

interface LastRegistration {
  fingerprint: string;
  at: number;
}

function readLastRegistration(): LastRegistration | undefined {
  const raw = readLocal(LAST_REGISTRATION_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<LastRegistration>;
    return typeof parsed.fingerprint === 'string' && typeof parsed.at === 'number'
      ? { fingerprint: parsed.fingerprint, at: parsed.at }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeLastRegistration(value: LastRegistration | undefined): void {
  if (value) writeLocal(LAST_REGISTRATION_KEY, JSON.stringify(value));
  else removeLocal(LAST_REGISTRATION_KEY);
}

function digest(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function registrationFingerprint(
  fcmToken: string,
  characterIds: readonly number[],
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]>,
  eveTypesByCharacter: ReadonlyMap<number, readonly string[]>,
  serverEventsByCharacter: ReadonlyMap<number, ServerEventRegistration>,
  quietHours: QuietHoursPayload | null,
  routeRules: RouteRules | null
): string {
  const characters = [...characterIds]
    .sort((a, b) => a - b)
    .map((characterId) => [
      characterId,
      [...(projectionsByCharacter.get(characterId) ?? NO_PROJECTION_ROWS)]
        .sort((a, b) =>
          a.occurrenceKey < b.occurrenceKey ? -1 : a.occurrenceKey > b.occurrenceKey ? 1 : 0
        )
        .map((row) => [
          row.occurrenceKey,
          row.eventId,
          row.fireAt,
          row.title,
          row.body,
          row.eveType ?? null,
        ]),
      [...(eveTypesByCharacter.get(characterId) ?? NO_EVE_TYPES)].sort(),
      serverEventsByCharacter.get(characterId) ?? NO_SERVER_EVENTS,
    ]);
  return digest(JSON.stringify([getDeviceId(), fcmToken, characters, quietHours, routeRules]));
}

let inFlight = 0;
let overlapped = false;

export interface RegisterDeviceOptions {
  skipIfUnchanged?: boolean;
  eveTypesByCharacter?: ReadonlyMap<number, readonly string[]>;
  quietHours?: QuietHoursPayload | null;
  serverEventsByCharacter?: ReadonlyMap<number, ServerEventRegistration>;
  routeRules?: RouteRules | null;
}

export async function registerDeviceForWebPush(
  vapidKey: string,
  serviceWorkerRegistration: ServiceWorkerRegistration,
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]> = new Map(),
  {
    skipIfUnchanged = false,
    eveTypesByCharacter = new Map(),
    serverEventsByCharacter = new Map(),
    quietHours = null,
    routeRules = null,
  }: RegisterDeviceOptions = {}
): Promise<RegisterDeviceResponse | null> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return null;

  const messaging = getMessaging(getFirebaseApp());
  const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!fcmToken) return null;

  if ((await db.characters.toArray()).length === 0) {
    await deleteToken(messaging).catch(() => {});
    return null;
  }

  const fingerprint = registrationFingerprint(
    fcmToken,
    characters.map((character) => character.characterId),
    projectionsByCharacter,
    eveTypesByCharacter,
    serverEventsByCharacter,
    quietHours,
    routeRules
  );
  const now = Date.now();
  if (skipIfUnchanged) {
    const last = readLastRegistration();
    if (last?.fingerprint === fingerprint && now - last.at < REREGISTER_AFTER_MS) return null;
  }

  const tokenAttempts = await Promise.allSettled(
    characters.map(async (character) => ({
      characterId: character.characterId,
      accessToken: await getValidAccessToken(character.characterId),
    }))
  );
  const withAccessTokens = tokenAttempts
    .filter(
      (attempt): attempt is PromiseFulfilledResult<{ characterId: number; accessToken: string }> =>
        attempt.status === 'fulfilled'
    )
    .map((attempt) => attempt.value);
  if (withAccessTokens.length === 0) return null;

  type RegisterDeviceRequest = {
    deviceId: string;
    fcmToken: string;
    characters: {
      characterId: number;
      accessToken: string;
      projectionRows: readonly ProjectionRow[];
      eveTypes: readonly string[];
      serverEvents: readonly string[];
      serverInputs: ServerEventRegistration['serverInputs'];
    }[];
    quietHours: QuietHoursPayload | null;
    routeRules?: RouteRules;
  };

  writeLastRegistration(undefined);
  inFlight += 1;
  if (inFlight > 1) overlapped = true;
  try {
    const result = await callRouted<RegisterDeviceRequest, RegisterDeviceResponse>(
      'registerDevice',
      {
        deviceId: getDeviceId(),
        fcmToken,
        quietHours,
        ...(routeRules ? { routeRules } : {}),
        characters: withAccessTokens.map((character) => ({
          ...character,
          projectionRows: projectionsByCharacter.get(character.characterId) ?? NO_PROJECTION_ROWS,
          eveTypes: eveTypesByCharacter.get(character.characterId) ?? NO_EVE_TYPES,
          ...(serverEventsByCharacter.get(character.characterId) ?? NO_SERVER_EVENTS),
        })),
      },
      undefined
    );
    if (
      !overlapped &&
      withAccessTokens.length === characters.length &&
      result.rejected.length === 0
    ) {
      writeLastRegistration({ fingerprint, at: now });
    }
    return result;
  } finally {
    inFlight -= 1;
    if (inFlight === 0) overlapped = false;
  }
}

export async function unregisterDeviceForWebPush(): Promise<void> {
  writeLastRegistration(undefined);
  await deleteToken(getMessaging(getFirebaseApp()));
}
