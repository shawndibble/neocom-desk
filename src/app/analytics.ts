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
  return initializeAnalytics(getFirebaseApp(), { config: { send_page_view: false } });
}

function getAnalyticsInstance(): Promise<Analytics | null> {
  analyticsPromise ??= loadAnalytics().catch((error: unknown) => {
    analyticsPromise = undefined;
    throw error;
  });
  return analyticsPromise;
}

export function pageLocationFor(location: Pick<Location, 'origin'>, pagePath: string): string {
  return location.origin + pagePath;
}

export async function trackPageView(pagePath: string, pageTitle?: string): Promise<void> {
  await useAnalyticsEnabled.getState().hydrate();
  if (!useAnalyticsEnabled.getState().value) return;
  await whenPageIdle();
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
