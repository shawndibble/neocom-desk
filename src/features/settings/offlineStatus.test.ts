import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAZY_SDE_FILES } from '@/sde/lazySdeFiles';

const mocks = vi.hoisted(() => ({
  cachedLazySdeFiles: vi.fn<() => Promise<Set<string>>>(),
  warmLazySde: vi.fn(),
  dogmaEngineAssetsCached: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('@/sde/warmLazySde', () => ({
  cachedLazySdeFiles: mocks.cachedLazySdeFiles,
  warmLazySde: mocks.warmLazySde,
}));
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({
  dogmaEngineAssetsCached: mocks.dogmaEngineAssetsCached,
}));

import { downloadEverything, readOfflineStatus, readStorageEstimate } from './offlineStatus';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('readOfflineStatus', () => {
  it('groups the cached files into packs and reports the engine', async () => {
    mocks.cachedLazySdeFiles.mockResolvedValue(new Set(['typeInfo/0.json', 'typeInfo/1.json']));
    mocks.dogmaEngineAssetsCached.mockResolvedValue(true);
    const status = await readOfflineStatus();
    expect(status.engine).toBe(true);
    expect(status.packs.find((pack) => pack.id === 'itemInfo')).toMatchObject({
      cached: 2,
      state: 'partial',
    });
    expect(status.totalCached).toBe(3);
    expect(status.total).toBe(LAZY_SDE_FILES.length + 1);
  });
});

describe('readStorageEstimate', () => {
  it('returns usage and quota', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 10, quota: 100 }) },
    });
    await expect(readStorageEstimate()).resolves.toEqual({ usage: 10, quota: 100 });
  });

  it('is null where unsupported, incomplete or throwing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(readStorageEstimate()).resolves.toBeNull();
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 10 }) } });
    await expect(readStorageEstimate()).resolves.toBeNull();
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => {
          throw new Error('x');
        },
      },
    });
    await expect(readStorageEstimate()).resolves.toBeNull();
  });
});

describe('downloadEverything', () => {
  it('runs the forced warm and passes progress through', async () => {
    mocks.warmLazySde.mockResolvedValue([]);
    const onProgress = vi.fn();
    await downloadEverything(onProgress);
    expect(mocks.warmLazySde).toHaveBeenCalledWith(
      { cancelled: false },
      { force: true, onProgress }
    );
  });
});
