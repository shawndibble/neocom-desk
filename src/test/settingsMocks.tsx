import { vi } from 'vitest';
export { pwaRegisterMock } from '@/test/assetsMocks';

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

export const foregroundPollerMock = (
  actual: typeof import('@/features/notifications/foregroundPoller')
) => ({ ...actual, runForegroundPoll: vi.fn(async () => {}) });

export const webPushMock = (actual: typeof import('@/features/notifications/webPush')) => ({
  ...actual,
  enableWebPush: vi.fn(actual.enableWebPush),
});

export const bootPrefetchMock = () => ({
  scheduleBootPrefetch: () => () => {},
  scheduleCachePrune: () => () => {},
  scheduleLazySdeWarm: () => () => {},
});
