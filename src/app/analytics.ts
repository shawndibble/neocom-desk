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

function getAnalyticsInstance(): Promise<Analytics | null> {
  analyticsPromise ??= loadAnalytics();
  return analyticsPromise;
}

export async function trackPageView(pagePath: string, pageTitle?: string): Promise<void> {
  const analytics = await getAnalyticsInstance();
  if (!analytics) return;
  const { logEvent } = await import('firebase/analytics');
  logEvent(analytics, 'page_view', {
    page_path: pagePath,
    page_title: pageTitle,
    page_location: window.location.href,
  });
}
