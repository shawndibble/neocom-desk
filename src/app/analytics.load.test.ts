import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseAnalytics = vi.hoisted(() => ({
  failImport: true,
  logEvent: vi.fn(),
  initializeAnalytics: vi.fn(() => ({})),
  getAnalytics: vi.fn(() => ({})),
}));

vi.mock('firebase/analytics', () => {
  if (firebaseAnalytics.failImport) {
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  return {
    getAnalytics: firebaseAnalytics.getAnalytics,
    initializeAnalytics: firebaseAnalytics.initializeAnalytics,
    isSupported: () => Promise.resolve(true),
    logEvent: firebaseAnalytics.logEvent,
  };
});

vi.mock('@/sync/firebaseCore', () => ({ getFirebaseApp: () => ({}) }));

function stubLocation(origin: string, pathname: string, href: string) {
  vi.stubGlobal('window', { location: { origin, pathname, href } });
}

describe('trackPageView when the analytics chunk fails to load', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-ABC123');
    stubLocation('https://neocomdesk.com', '/', 'https://neocomdesk.com/');
    firebaseAnalytics.failImport = true;
    firebaseAnalytics.logEvent.mockClear();
    firebaseAnalytics.initializeAnalytics.mockClear();
    firebaseAnalytics.getAnalytics.mockClear();
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

describe('trackPageView privacy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-ABC123');
    firebaseAnalytics.failImport = false;
    firebaseAnalytics.logEvent.mockClear();
    firebaseAnalytics.initializeAnalytics.mockClear();
    firebaseAnalytics.getAnalytics.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function pageLocationFor(origin: string, pathname: string, href: string) {
    stubLocation(origin, pathname, href);
    const { trackPageView } = await import('./analytics');
    await trackPageView(pathname);
    return firebaseAnalytics.logEvent.mock.calls[0][2] as Record<string, unknown>;
  }

  it('drops query and fragment from page_location', async () => {
    const params = await pageLocationFor(
      'https://neocomdesk.com',
      '/market/browser',
      'https://neocomdesk.com/market/browser?pilot=Alice&q=tritanium#x'
    );
    expect(params.page_location).toBe('https://neocomdesk.com/market/browser');
    expect(JSON.stringify(Object.values(params))).not.toMatch(/Alice|tritanium|#x/);
  });

  it('drops a query-only suffix', async () => {
    const params = await pageLocationFor(
      'https://neocomdesk.com',
      '/market/browser',
      'https://neocomdesk.com/market/browser?q=tritanium'
    );
    expect(params.page_location).toBe('https://neocomdesk.com/market/browser');
  });

  it('drops a fragment-only suffix', async () => {
    const params = await pageLocationFor(
      'https://neocomdesk.com',
      '/market/browser',
      'https://neocomdesk.com/market/browser#secret'
    );
    expect(params.page_location).toBe('https://neocomdesk.com/market/browser');
  });

  it('keeps the root path', async () => {
    const params = await pageLocationFor(
      'https://neocomdesk.com',
      '/',
      'https://neocomdesk.com/?x=1'
    );
    expect(params.page_location).toBe('https://neocomdesk.com/');
  });

  it('creates analytics with send_page_view off, not via getAnalytics', async () => {
    await pageLocationFor('https://neocomdesk.com', '/', 'https://neocomdesk.com/');
    expect(firebaseAnalytics.initializeAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ config: expect.objectContaining({ send_page_view: false }) })
    );
    expect(firebaseAnalytics.getAnalytics).not.toHaveBeenCalled();
  });
});
