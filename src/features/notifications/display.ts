/**
 * How a notification fired from the *page* (the Foreground Poller) actually
 * reaches the OS.
 *
 * `new Notification(...)` is desktop-only in practice. Chrome on Android
 * throws `TypeError: Illegal constructor` for it, and iOS/iPadOS has never
 * shipped the constructor at all — an installed iOS PWA grants
 * `Notification.permission` and exposes `Notification.requestPermission()`,
 * but the only way to *show* one is
 * `ServiceWorkerRegistration.showNotification`. So on exactly the platform
 * this app's install prompt courts, the constructor path is silently dead:
 * permission reads 'granted', the poller diffs correctly, and every fire is
 * swallowed by the throw.
 *
 * The Service Worker path is therefore tried first — the same
 * `showNotification` call `backgroundPoller.ts` makes from inside the worker,
 * only reached through `navigator.serviceWorker` from the page side — with
 * the constructor kept as the fallback for a page with no worker registered
 * yet (dev server, first load before activation) where it does still work.
 *
 * `getRegistration()` rather than `serviceWorker.ready`: `ready` never
 * settles when nothing is registered, and this runs inside the poller's
 * per-fire loop, which must not hang.
 */
import type { AppNotificationOptions } from './notificationOptions';

export interface PageDisplayEnv {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  /** `undefined` on a browser with no Notification API at all. */
  construct: ((title: string, options: AppNotificationOptions) => void) | undefined;
}

export function livePageDisplayEnv(): PageDisplayEnv {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  return {
    getRegistration: async () => (container ? container.getRegistration() : undefined),
    construct:
      typeof Notification === 'undefined'
        ? undefined
        : (title, options) => {
            new Notification(title, options);
          },
  };
}

/**
 * Never throws and never rejects: pollerState is persisted before the notify
 * loop runs (`foregroundPoller.ts`), so a failure here — permission revoked
 * mid-poll, a platform rejecting one path or both — must not abort the rest
 * of this poll's already-persisted fires.
 */
export async function displayPageNotification(
  env: PageDisplayEnv,
  title: string,
  options: AppNotificationOptions
): Promise<void> {
  try {
    const registration = await env.getRegistration();
    if (registration && typeof registration.showNotification === 'function') {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    // Fall through to the constructor: a worker that refused to show it may
    // still leave a page-context notification working (desktop).
  }

  if (!env.construct) return;
  try {
    // The constructor ignores `badge` and cannot be clicked into the Service
    // Worker's `notificationclick`, but `tag` and `icon` still apply — and
    // this branch only runs on a desktop page with no worker yet.
    env.construct(title, options);
  } catch {
    // See doc comment above.
  }
}
