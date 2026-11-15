import { vi } from 'vitest';
export { pwaRegisterMock } from '@/test/assetsMocks';

// Shared mock factories for the Settings route tests (Settings*.test.tsx).
// Kept free of app runtime imports: a `vi.mock` factory imports this module
// while the app graph is still loading.

export const navigationMock = () => ({ assignLocation: vi.fn() });
export const forceUpdateMock = () => ({ forceUpdate: vi.fn() });
export const serviceWorkerMock = () => ({
  getServiceWorkerRegistration: vi.fn().mockResolvedValue(undefined),
});

export const loadSdeMock = () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
});

export const projectionRebuildMock = () => ({ rebuildProjection: vi.fn(async () => {}) });

/**
 * `ForegroundNotificationPoller` runs a poll shortly after every `<App/>`
 * mount (`FIRST_POLL_DELAY_MS`), and a poll that reaches its end unconditionally
 * calls `rebuildProjection` too (`foregroundPoller.ts`). Settings has nothing to
 * do with the poller, so the real thing cross-contaminated `rebuildProjection`'s
 * call count (issue #2065). A real `vi.fn()`, not a bare no-op, so a caller can
 * still assert against it. Only the `<App />` tests mount the poller.
 */
export const foregroundPollerMock = (
  actual: typeof import('@/features/notifications/foregroundPoller')
) => ({ ...actual, runForegroundPoll: vi.fn(async () => {}) });

export const webPushMock = (actual: typeof import('@/features/notifications/webPush')) => ({
  ...actual,
  enableWebPush: vi.fn(actual.enableWebPush),
});

/**
 * Same reasoning for the boot cache warm-up: it starts in the first idle slot
 * (`bootPrefetch.ts`; a 2 s timer under jsdom), which lands mid-test and
 * re-renders the page under a click. Settings reads nothing it warms. Only the
 * `<App />` tests boot it.
 */
export const bootPrefetchMock = () => ({
  scheduleBootPrefetch: () => () => {},
  scheduleCachePrune: () => () => {},
  scheduleLazySdeWarm: () => () => {},
});
