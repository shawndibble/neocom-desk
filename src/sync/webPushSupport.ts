/**
 * Whether this device can receive Web Push (issue #356, ADR 0010) — a pure
 * read of the environment, used to decide whether to offer the flow at all
 * and, when not, why not: iOS delivers Web Push only to an installed PWA, so a
 * non-installed iOS Safari tab must be told that rather than silently failing
 * the permission request.
 *
 * Deliberately Firebase-free, split out of `deviceRegistration.ts`: the
 * permission prompt and the projection upload gate on it from the startup
 * bundle, which must never statically reach Firebase
 * (`app/bootImportGraph.test.ts`).
 */

export type WebPushSupport = 'unsupported' | 'requires-install' | 'supported';

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
