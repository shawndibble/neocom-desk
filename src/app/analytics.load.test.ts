import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseAnalytics = vi.hoisted(() => ({
  failImport: true,
  logEvent: vi.fn(),
}));

vi.mock('firebase/analytics', () => {
  if (firebaseAnalytics.failImport) {
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  return {
    getAnalytics: () => ({}),
    isSupported: () => Promise.resolve(true),
    logEvent: firebaseAnalytics.logEvent,
  };
});

vi.mock('@/sync/firebaseApp', () => ({ getFirebaseApp: () => ({}) }));

describe('trackPageView when the analytics chunk fails to load', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-ABC123');
    vi.stubGlobal('window', { location: { href: 'https://neocomdesk.com/' } });
    firebaseAnalytics.failImport = true;
    firebaseAnalytics.logEvent.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('resolves instead of rejecting, so a page view never surfaces an unhandled rejection', async () => {
    const { trackPageView } = await import('./analytics');
    await expect(trackPageView('/market/browser')).resolves.toBeUndefined();
  });

  it('does not cache a failed load, so a later page view tries again', async () => {
    const { trackPageView } = await import('./analytics');
    await trackPageView('/market/browser');

    firebaseAnalytics.failImport = false;
    vi.resetModules();
    await trackPageView('/market/orders');

    expect(firebaseAnalytics.logEvent).toHaveBeenCalledWith(
      {},
      'page_view',
      expect.objectContaining({ page_path: '/market/orders' })
    );
  });
});
