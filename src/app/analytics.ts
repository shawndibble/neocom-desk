/**
 * Firebase Analytics (GA4), gated the same way sync is (`syncStatus.ts`):
 * needs a measurement ID and must not run under the test runner. `firebase/
 * analytics` is dynamically imported so it never lands in the main chunk for
 * builds that ship without one (mirrors this repo's `firestore/lite` choice).
 *
 * `isSupported()` additionally rules out environments without cookies/
 * IndexedDB (some privacy modes) — analytics silently no-ops there rather
 * than throwing.
 *
 * The Firebase app is dynamically imported too, from `sync/firebaseCore`
 * (just `firebase/app`) rather than `sync/firebaseApp` (auth + firestore +
 * functions): this module is reached statically from `App.tsx`, and a static
 * Firebase import here once pulled the whole SDK into the startup bundle
 * (`app/bootImportGraph.test.ts` guards that now).
 */
import type { Analytics } from 'firebase/analytics';
import { useAnalyticsEnabled } from './analyticsPref';
import { whenPageIdle } from './analyticsIdle';

export interface AnalyticsEnv {
  MODE?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
  DEV?: boolean;
  VITE_FIREBASE_EMULATORS?: string;
}

export function isAnalyticsConfigured(env: AnalyticsEnv = import.meta.env): boolean {
  // Against the local emulators (`sync/firebaseCore.emulatorsOn`, mirrored here
  // because that module is Firebase and this one is on the startup path) the
  // demo project has no GA4 stream: Installations and gtag would hit the real
  // servers and fail with 403.
  if (env.DEV && env.VITE_FIREBASE_EMULATORS === '1') return false;
  return env.MODE !== 'test' && Boolean(env.VITE_FIREBASE_MEASUREMENT_ID);
}

let analyticsPromise: Promise<Analytics | null> | undefined;

async function loadAnalytics(): Promise<Analytics | null> {
  if (!isAnalyticsConfigured()) return null;
  const [{ initializeAnalytics, isSupported }, { getFirebaseApp }] = await Promise.all([
    import('firebase/analytics'),
    import('@/sync/firebaseCore'),
  ]);
  if (!(await isSupported())) return null;
  // Firebase's default config also emits its own initial `page_view` with the
  // full URL; `AnalyticsPageViewTracker` is the only source we want.
  return initializeAnalytics(getFirebaseApp(), { config: { send_page_view: false } });
}

/**
 * A failed chunk load (a stale hash after a deploy, or a flaky mobile
 * connection) isn't cached, so a later page view can try again rather than
 * re-throwing the same rejected promise on every route change.
 */
function getAnalyticsInstance(): Promise<Analytics | null> {
  analyticsPromise ??= loadAnalytics().catch((error: unknown) => {
    analyticsPromise = undefined;
    throw error;
  });
  return analyticsPromise;
}

/**
 * Origin + the route pattern `pagePathFor` reports, never the raw pathname:
 * that carries a Share Link's id (`/s/:shareId`, the only secret keeping a
 * share private), plan ids and corporation ids. Query strings and fragments
 * are dropped too, since they can carry pilot names or searches.
 */
export function pageLocationFor(location: Pick<Location, 'origin'>, pagePath: string): string {
  return location.origin + pagePath;
}

/**
 * Callers fire-and-forget this on every route change, so a failed chunk load
 * drops the page view instead of rejecting — only the load is guarded, so a
 * bug in `logEvent`'s payload still surfaces.
 */
export async function trackPageView(pagePath: string, pageTitle?: string): Promise<void> {
  // Hydrate first: Dexie is async, so a pilot who opted out must not fire a
  // page view at the default. Read at call time so a mid-session toggle applies.
  await useAnalyticsEnabled.getState().hydrate();
  if (!useAnalyticsEnabled.getState().value) return;
  // Opt-out is checked first so an opted-out pilot never waits or loads gtag.
  // Page views fired before the page is idle queue here and send in order.
  await whenPageIdle();
  // The pilot may have opted out while this view was queued.
  if (!useAnalyticsEnabled.getState().value) return;
  let analytics: Analytics | null;
  let logEvent: typeof import('firebase/analytics').logEvent;
  try {
    analytics = await getAnalyticsInstance();
    if (!analytics) return;
    ({ logEvent } = await import('firebase/analytics'));
  } catch {
    return;
  }
  logEvent(analytics, 'page_view', {
    page_path: pagePath,
    page_title: pageTitle,
    page_location: pageLocationFor(window.location, pagePath),
  });
}
