/**
 * The one real entry point into Web Push (issue #356): called from a
 * deliberate user tap (the permission explainer's Enable button, and
 * Settings' own Enable button — the same two callers `permission.ts`
 * documents for `requestNotificationPermission`), so the FCM token
 * acquisition and the permission request share the gesture Safari requires.
 *
 * `@/sync/deviceRegistration` is Firebase, so it loads on demand � this module
 * is reached from the startup bundle (`app/bootImportGraph.test.ts`). The load
 * starts before the permission request but is only awaited after it: nothing
 * may be awaited ahead of `requestNotificationPermission`, or Safari no longer
 * counts the request as part of the tap.
 */
import { requestNotificationPermission, type NotificationPermissionState } from './permission';
import { webPushSupport, type WebPushSupport } from '@/sync/webPushSupport';

export interface EnableWebPushResult {
  support: WebPushSupport;
  permission: NotificationPermissionState;
}

export async function enableWebPush(): Promise<EnableWebPushResult> {
  const support = webPushSupport();
  if (support === 'requires-install') {
    // Never asks the browser for permission here — a grant that can't
    // deliver anything (iOS Safari, not installed) is worse than none, per
    // the same "denied can't be re-requested" reasoning `permission.ts` uses.
    return { support, permission: 'default' };
  }

  const deviceRegistration =
    support === 'supported' ? import('@/sync/deviceRegistration') : undefined;
  // Awaited only on the grant path below; a denial must not leave the load's
  // failure unhandled.
  deviceRegistration?.catch(() => {});

  const permission = await requestNotificationPermission();
  if (permission === 'granted' && deviceRegistration) {
    try {
      const { registerDeviceForWebPush } = await deviceRegistration;
      const registration = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';
      await registerDeviceForWebPush(vapidKey, registration);
    } catch (err) {
      // Registration failing must not undo a permission grant the browser
      // already gave — the user is still enrolled for the feed/foreground
      // channel either way, and this is retried on the next Enable tap.
      console.error('Web Push device registration failed', err);
    }
  }
  return { support, permission };
}
