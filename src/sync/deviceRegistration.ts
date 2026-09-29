/**
 * Web Push device registration (issue #356, ADR 0010).
 *
 * Whether to offer the flow at all is `webPushSupport.ts`, a pure read of the
 * environment kept apart so the startup bundle can ask it without loading
 * Firebase. This module *is* Firebase: reach it only through `await
 * import(...)` from anything the startup bundle reaches
 * (`app/bootImportGraph.test.ts`).
 *
 * `registerDeviceForWebPush` is the one-call orchestration: acquire an FCM
 * token, gather every stored Character's access token (already cached by
 * `auth/session.ts`), and hand the batch to the `registerDevice` callable.
 * The Enable tap's call must happen in the same user gesture as the
 * permission grant — Safari requires the FCM/permission dance to happen in
 * one, and this is also the point at which an iOS user must already have
 * installed the PWA.
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
 * Acquire an FCM token and register this device against every Character
 * currently stored on it. Returns `null` (not an error) when there is
 * nothing to register — no FCM token available, or no Character stored yet —
 * both ordinary, non-exceptional states.
 *
 * `projectionsByCharacter` is this call's Scheduled Push upload (issue #358,
 * ADR 0010, CONTEXT.md round 45): each Character's whole 72-hour Projection
 * window, replacing whatever this device previously uploaded for that
 * Character wholesale — never another device's rows (issue #2240).
 * A Character with no entry here (the default, an empty map) uploads an empty
 * Projection — correct for a caller with nothing projectable to say, and for
 * every call site before this ticket wired one up.
 */
export async function registerDeviceForWebPush(
  vapidKey: string,
  serviceWorkerRegistration: ServiceWorkerRegistration,
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]> = new Map()
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

/**
 * Drop this device's FCM token so the backend can no longer push to it — the
 * counterpart of `registerDeviceForWebPush` for when the last Character
 * leaves this device (Remove / Log out). Only this device's own registration
 * is touched; other devices keep theirs.
 */
export async function unregisterDeviceForWebPush(): Promise<void> {
  await deleteToken(getMessaging(getFirebaseApp()));
}
