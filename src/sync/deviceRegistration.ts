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
import { getFirebaseApp, getSyncFunctions } from './firebaseApp';
import { getDeviceId } from './deviceId';

export type WebPushSupport = 'unsupported' | 'requires-install' | 'supported';

interface RegisterDeviceResponse {
  deviceId: string;
  registered: number[];
  rejected: number[];
}

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
  if (typeof Notification === 'undefined' || !navigator.serviceWorker) return 'unsupported';
  if (isIos() && !isStandalone()) return 'requires-install';
  return 'supported';
}

/**
 * Acquire an FCM token and register this device against every Character
 * currently stored on it. Returns `null` (not an error) when there is
 * nothing to register — no FCM token available, or no Character stored yet —
 * both ordinary, non-exceptional states.
 */
export async function registerDeviceForWebPush(
  vapidKey: string,
  serviceWorkerRegistration: ServiceWorkerRegistration
): Promise<RegisterDeviceResponse | null> {
  const messaging = getMessaging(getFirebaseApp());
  const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!fcmToken) return null;

  const characters = await db.characters.toArray();
  if (characters.length === 0) return null;

  const withAccessTokens = await Promise.all(
    characters.map(async (character) => ({
      characterId: character.characterId,
      accessToken: await getValidAccessToken(character.characterId),
    }))
  );

  const call = httpsCallable<
    {
      deviceId: string;
      fcmToken: string;
      characters: { characterId: number; accessToken: string }[];
    },
    RegisterDeviceResponse
  >(getSyncFunctions(), 'registerDevice');

  const result = await call({
    deviceId: getDeviceId(),
    fcmToken,
    characters: withAccessTokens,
  });
  return result.data;
}
