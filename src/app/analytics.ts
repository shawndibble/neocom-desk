/**
 * Firebase Analytics (GA4), gated the same way sync is (`syncStatus.ts`):
 * needs a measurement ID and must not run under the test runner. `firebase/
 * analytics` is dynamically imported so it never lands in the main chunk for
 * builds that ship without one (mirrors this repo's `firestore/lite` choice).
 *
 * `isSupported()` additionally rules out environments without cookies/
 * IndexedDB (some privacy modes) — analytics silently no-ops there rather
 * than throwing.
 */
import { getFirebaseApp } from '@/sync/firebaseApp';
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
  const { getAnalytics, isSupported } = await import('firebase/analytics');
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
