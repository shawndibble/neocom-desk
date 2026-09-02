/**
 * Registers the Periodic Background Sync handler `src/sw.ts` listens for
 * (ADR 0007, issue #176) — a one-time, best-effort ask made from the page,
 * same shape as `configureEsi` in `App.tsx`. Chrome/Edge desktop+Android
 * only, installed-PWA only; every other browser/platform falls through to
 * `'periodicSync' in registration` being false and this becomes a no-op
 * (AC4) — the Foreground Poller (`ForegroundNotificationPoller.tsx`) is the
 * one guarantee, this is only ever a supplement to it.
 */
export const PERIODIC_SYNC_TAG = 'notification-poll';

/**
 * A registration argument, not a schedule: the browser treats it as a
 * *minimum* gap and otherwise decides for itself based on site engagement,
 * battery, and network state — often much coarser than this in practice.
 * Set to the same cadence as `POLL_INTERVAL_MS` (foregroundPoller.ts) purely
 * as the smallest value that expresses "at least as often as the foreground
 * poller would" to the browser; it is not a delivery guarantee.
 */
export const PERIODIC_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

export interface BackgroundSyncEnv {
  serviceWorker: ServiceWorkerContainer | undefined;
  permissions: Permissions | undefined;
}

export function liveBackgroundSyncEnv(): BackgroundSyncEnv {
  return {
    serviceWorker: typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
    permissions: typeof navigator === 'undefined' ? undefined : navigator.permissions,
  };
}

/**
 * Never throws — every branch (API absent, permission not granted, the
 * browser rejecting `.register()` outright) is a silent no-op, per AC4.
 */
export async function registerPeriodicSync(env: BackgroundSyncEnv): Promise<void> {
  if (!env.serviceWorker) return;
  try {
    const registration = await env.serviceWorker.ready;
    if (!registration.periodicSync) return;

    if (env.permissions) {
      // 'periodic-background-sync' isn't in TS's `PermissionName` union
      // (Chrome-only, no spec beyond the WICG draft) — same reason it needs
      // src/types/periodic-sync.d.ts for the registration/event types below.
      const status = await env.permissions.query({
        name: 'periodic-background-sync',
      } as unknown as PermissionDescriptor);
      if (status.state !== 'granted') return;
    }

    await registration.periodicSync.register(PERIODIC_SYNC_TAG, {
      minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS,
    });
  } catch {
    // Unsupported/denied/registration failure — foreground-only polling
    // remains the source of truth (AC4).
  }
}
