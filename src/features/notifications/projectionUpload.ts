/**
 * Scheduled Push upload wiring (issue #358, ADR 0010, CONTEXT.md round 45):
 * the live boundary between the Foreground Poller's freshly computed
 * Projection rows (`foregroundPoller.ts`) and the `registerDevice` callable
 * (`@/sync/deviceRegistration`). Best-effort and silent by design, mirroring
 * `webPush.ts`'s own `enableWebPush` â€” an upload failing must not interrupt a
 * poll that already delivered whatever it could locally, and there is
 * nowhere on a background poll tick to surface an error to anyway.
 *
 * Gated on live permission (`webPushSupport`) rather than attempted
 * unconditionally: a device with no granted push permission has no FCM token
 * to register against, so `registerDeviceForWebPush` would just fail its own
 * `getToken` call every 5 minutes for no reason. Past that gate the upload is
 * also skipped when nothing changed since the last one (`skipIfUnchanged`),
 * so an idle poll doesn't refresh every Character's access token and call the
 * backend just to write what it already holds.
 *
 * Firebase-free on purpose: this module is reached statically from the
 * startup bundle (the Foreground Poller in `Layout`, and Remove / Log out), so
 * `@/sync/deviceRegistration` loads on demand, past the gates — a device that
 * never enabled push never fetches it (`app/bootImportGraph.test.ts`).
 */
import type { ProjectionRow } from '@/engine/projection';
import { webPushSupport } from '@/sync/webPushSupport';
import { readNotificationPermission } from './permission';

export async function uploadProjectionRows(
  rowsByCharacter: ReadonlyMap<number, ProjectionRow[]>
): Promise<void> {
  if (webPushSupport() !== 'supported') return;
  if (readNotificationPermission() !== 'granted') return;

  try {
    const { registerDeviceForWebPush } = await import('@/sync/deviceRegistration');
    const registration = await navigator.serviceWorker.ready;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';
    await registerDeviceForWebPush(vapidKey, registration, rowsByCharacter, {
      skipIfUnchanged: true,
    });
  } catch (err) {
    // Same fire-and-forget contract as sendBrowserNotification/
    // recordFeedNotification in foregroundPoller.ts: the poll itself must
    // not fail because the Scheduled Push upload did.
    console.error('Scheduled Push projection upload failed', err);
  }
}

/**
 * Drop this device's Scheduled Push registration once no Character is left on
 * it. Same gate and same silence as `uploadProjectionRows`: a device that
 * never enabled push has no token to delete.
 */
export async function unregisterProjectionRegistration(): Promise<void> {
  if (webPushSupport() !== 'supported') return;
  if (readNotificationPermission() !== 'granted') return;

  try {
    const { unregisterDeviceForWebPush } = await import('@/sync/deviceRegistration');
    await unregisterDeviceForWebPush();
  } catch (err) {
    console.error('Scheduled Push unregistration failed', err);
  }
}
