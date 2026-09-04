/**
 * Scheduled Push upload wiring (issue #358, ADR 0010, CONTEXT.md round 45):
 * the live boundary between the Foreground Poller's freshly computed
 * Projection rows (`foregroundPoller.ts`) and the `registerDevice` callable
 * (`@/sync/deviceRegistration`). Best-effort and silent by design, mirroring
 * `webPush.ts`'s own `enableWebPush` — an upload failing must not interrupt a
 * poll that already delivered whatever it could locally, and there is
 * nowhere on a background poll tick to surface an error to anyway.
 *
 * Gated on live permission (`webPushSupport`) rather than attempted
 * unconditionally: a device with no granted push permission has no FCM token
 * to register against, so `registerDeviceForWebPush` would just fail its own
 * `getToken` call every 5 minutes for no reason.
 */
import type { ProjectionRow } from '@/engine/projection';
import { webPushSupport, registerDeviceForWebPush } from '@/sync/deviceRegistration';
import { readNotificationPermission } from './permission';

export async function uploadProjectionRows(
  rowsByCharacter: ReadonlyMap<number, ProjectionRow[]>
): Promise<void> {
  if (webPushSupport() !== 'supported') return;
  if (readNotificationPermission() !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';
    await registerDeviceForWebPush(vapidKey, registration, rowsByCharacter);
  } catch (err) {
    // Same fire-and-forget contract as sendBrowserNotification/
    // recordFeedNotification in foregroundPoller.ts: the poll itself must
    // not fail because the Scheduled Push upload did.
    console.error('Scheduled Push projection upload failed', err);
  }
}
