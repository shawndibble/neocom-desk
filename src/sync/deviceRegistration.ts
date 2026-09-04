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
import { getMessaging, getToken } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import type { ProjectionRow } from '@/engine/projection';
import { getFirebaseApp, getSyncFunctions } from './firebaseApp';
import { getDeviceId } from './deviceId';

export type WebPushSupport = 'unsupported' | 'requires-install' | 'supported';

interface RegisterDeviceResponse {
  deviceId: string;
  registered: number[];
  rejected: number[];
}

/** No Projection to upload for a Character this call doesn't mention. */
const NO_PROJECTION_ROWS: readonly ProjectionRow[] = [];

function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

/** True once launched as an installed PWA (Android/desktop `display-mode`, or iOS's own flag). */
function isStandalone(): boolean {
  const standaloneMedia =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}

/**
 * Whether this device can receive Web Push right now. `'requires-install'` is
 * distinct from `'unsupported'`: the capability exists, but only once the
 * page is running as an installed PWA (iOS Safari's own restriction) — the
 * permission flow should explain that rather than requesting a grant that
 * will never deliver anything.
 */
export function webPushSupport(): WebPushSupport {
  // Checked before the Notification/serviceWorker probe below: real
  // non-installed iOS Safari has no `Notification` global at all, so that
  // check alone would misreport 'unsupported' and this branch would never
  // be reached on the one platform it exists for.
  if (isIos() && !isStandalone()) return 'requires-install';
  if (typeof Notification === 'undefined' || !navigator.serviceWorker) return 'unsupported';
  return 'supported';
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
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]> = new Map()
): Promise<RegisterDeviceResponse | null> {
  const messaging = getMessaging(getFirebaseApp());
  const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!fcmToken) return null;

  const characters = await db.characters.toArray();
  if (characters.length === 0) return null;

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
  return result.data;
}
