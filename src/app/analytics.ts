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

export interface AnalyticsEnv {
  MODE?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
}

export function isAnalyticsConfigured(env: AnalyticsEnv = import.meta.env): boolean {
  return env.MODE !== 'test' && Boolean(env.VITE_FIREBASE_MEASUREMENT_ID);
}

let analyticsPromise: Promise<Analytics | null> | undefined;

async function loadAnalytics(): Promise<Analytics | null> {
  if (!isAnalyticsConfigured()) return null;
  const [{ getAnalytics, isSupported }, { getFirebaseApp }] = await Promise.all([
    import('firebase/analytics'),
    import('@/sync/firebaseCore'),
  ]);
  if (!(await isSupported())) return null;
  return getAnalytics(getFirebaseApp());
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
 * Callers fire-and-forget this on every route change, so a failed chunk load
 * drops the page view instead of rejecting — only the load is guarded, so a
 * bug in `logEvent`'s payload still surfaces.
 */
export async function trackPageView(pagePath: string, pageTitle?: string): Promise<void> {
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
    page_location: window.location.href,
  });
}
