/**
 * Web Push device registration (issue #356, ADR 0010).
 *
 * Two halves:
 * - `webPushSupport` is a pure read of the environment, used to decide
 *   whether to offer the flow at all and, when not, why not — iOS delivers
 *   Web Push only to an installed PWA, so a non-installed iOS Safari tab must
 *   be told that rather than silently failing the permission request.
 * - `registerDeviceForWebPush` is the one-call orchestration: acquire an FCM
 *   token, gather every stored Character's access token (already cached by
 *   `auth/session.ts`), and hand the batch to the `registerDevice` callable.
 *   Must be called from the same user gesture as the permission grant —
 *   Safari requires the FCM/permission dance to happen in one, and this is
 *   also the point at which an iOS user must already have installed the PWA.
 */
import { deleteToken, getMessaging, getToken } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import type { ProjectionRow } from '@/engine/projection';
import { getFirebaseApp, getSyncFunctions } from './firebaseApp';
import { getDeviceId } from './deviceId';

interface RegisterDeviceResponse {
  deviceId: string;
  registered: number[];
  rejected: number[];
}

/** No Projection to upload for a Character this call doesn't mention. */
const NO_PROJECTION_ROWS: readonly ProjectionRow[] = [];

/**
 * How long an unchanged registration is trusted before the poll re-sends it
 * anyway. The backend keeps a device doc until a send to its token fails
 * (`functions/src/index.ts` `dispatchProjections`) � nothing expires it on
 * `updatedAt` � so this is only a backstop against the backend losing a
 * write, and the 7-day stale-unsent projection purge (keyed on `fireAt`) is
 * far outside it either way.
 */
export const REREGISTER_AFTER_MS = 12 * 3_600_000;

/** Device-local, never synced: what this device last registered, and when. */
const LAST_REGISTRATION_KEY = 'neocom.lastPushRegistration';

interface LastRegistration {
  fingerprint: string;
  at: number;
}

function readLastRegistration(): LastRegistration | undefined {
  try {
    const raw = localStorage.getItem(LAST_REGISTRATION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<LastRegistration>;
    return typeof parsed.fingerprint === 'string' && typeof parsed.at === 'number'
      ? { fingerprint: parsed.fingerprint, at: parsed.at }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeLastRegistration(value: LastRegistration | undefined): void {
  try {
    if (value) localStorage.setItem(LAST_REGISTRATION_KEY, JSON.stringify(value));
    else localStorage.removeItem(LAST_REGISTRATION_KEY);
  } catch {
    // Storage blocked (private mode): every poll just re-registers, as before.
  }
}

/** cyrb53 � a short, stable digest so a 72-hour Projection isn't stored verbatim. */
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

/**
 * Everything the callable would change on the backend: which token reaches
 * which Characters, and each one's Projection. Order-insensitive, so a rebuild
 * that finds the same rows in another order doesn't count as a change.
 */
function registrationFingerprint(
  fcmToken: string,
  characterIds: readonly number[],
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]>
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
    ]);
  return digest(JSON.stringify([getDeviceId(), fcmToken, characters]));
}

export interface RegisterDeviceOptions {
  /**
   * Skip the whole registration � every Character's access-token refresh and
   * the callable � when this device already registered the same FCM token,
   * roster and Projections within {@link REREGISTER_AFTER_MS}. The 5-minute
   * Foreground Poller sets this; the Enable tap does not, so a user-initiated
   * enable always reaches the backend.
   */
  skipIfUnchanged?: boolean;
}

/**
 * Acquire an FCM token and register this device against every Character
 * currently stored on it. Returns `null` (not an error) when there is
 * nothing to register — no FCM token available, or no Character stored yet —
 * both ordinary, non-exceptional states.
 *
 * `projectionsByCharacter` is this call's Scheduled Push upload (issue #358,
 * ADR 0010, CONTEXT.md round 45): each Character's whole 72-hour Projection
 * window, replacing whatever the backend holds for that Character wholesale.
 * A Character with no entry here (the default, an empty map) uploads an empty
 * Projection — correct for a caller with nothing projectable to say, and for
 * every call site before this ticket wired one up.
 */
export async function registerDeviceForWebPush(
  vapidKey: string,
  serviceWorkerRegistration: ServiceWorkerRegistration,
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]> = new Map(),
  { skipIfUnchanged = false }: RegisterDeviceOptions = {}
): Promise<RegisterDeviceResponse | null> {
  // Checked before `getToken`: a late rebuild on an emptied roster (after
  // Remove / Log out) must not mint a fresh FCM token just to discard it.
  const characters = await db.characters.toArray();
  if (characters.length === 0) return null;

  const messaging = getMessaging(getFirebaseApp());
  const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!fcmToken) return null;

  // The roster can empty while `getToken` awaits (Remove / Log out ran its
  // `deleteToken` before this token existed): drop the token just minted.
  if ((await db.characters.toArray()).length === 0) {
    await deleteToken(messaging).catch(() => {});
    return null;
  }

  const fingerprint = registrationFingerprint(
    fcmToken,
    characters.map((character) => character.characterId),
    projectionsByCharacter
  );
  const now = Date.now();
  if (skipIfUnchanged) {
    const last = readLastRegistration();
    if (last?.fingerprint === fingerprint && now - last.at < REREGISTER_AFTER_MS) return null;
  }

  // A stale/expired token for one Character must not stop the others from
  // registering — settle each independently rather than Promise.all, which
  // would reject (and register nobody) on the first failure. Mirrors the
  // backend's own per-character partial-success design (registerDevice.ts).
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

  const call = httpsCallable<
    {
      deviceId: string;
      fcmToken: string;
      characters: {
        characterId: number;
        accessToken: string;
        projectionRows: readonly ProjectionRow[];
      }[];
    },
    RegisterDeviceResponse
  >(getSyncFunctions(), 'registerDevice');

  const result = await call({
    deviceId: getDeviceId(),
    fcmToken,
    characters: withAccessTokens.map((character) => ({
      ...character,
      projectionRows: projectionsByCharacter.get(character.characterId) ?? NO_PROJECTION_ROWS,
    })),
  });
  // Remembered only when every Character landed: one that couldn't get a
  // token, or that the backend rejected, must be retried on the next poll
  // rather than left unregistered for REREGISTER_AFTER_MS.
  if (withAccessTokens.length === characters.length && result.data.rejected.length === 0) {
    writeLastRegistration({ fingerprint, at: now });
  }
  return result.data;
}

/**
 * Drop this device's FCM token so the backend can no longer push to it — the
 * counterpart of `registerDeviceForWebPush` for when the last Character
 * leaves this device (Remove / Log out). Only this device's own registration
 * is touched; other devices keep theirs.
 */
export async function unregisterDeviceForWebPush(): Promise<void> {
  writeLastRegistration(undefined);
  await deleteToken(getMessaging(getFirebaseApp()));
}
