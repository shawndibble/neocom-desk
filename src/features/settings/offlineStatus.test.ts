import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchLazyChunkList: vi.fn<() => Promise<string[]>>(async () => []),
  cachedLazyChunks: vi.fn<(files: readonly string[]) => Promise<Set<string>>>(
    async () => new Set<string>()
  ),
  cachedLazySdeFiles: vi.fn<() => Promise<Set<string>>>(),
  warmLazySde: vi.fn(),
  hasControllingServiceWorker: vi.fn(() => true),
  dogmaEngineAssetsCached: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('@/sde/warmLazySde', () => ({
  LAZY_ASSET_TOTAL: 74,
  cachedLazySdeFiles: mocks.cachedLazySdeFiles,
  warmLazySde: mocks.warmLazySde,
  hasControllingServiceWorker: mocks.hasControllingServiceWorker,
}));
vi.mock('@/sde/lazyChunkList', () => ({
  fetchLazyChunkList: mocks.fetchLazyChunkList,
  cachedLazyChunks: mocks.cachedLazyChunks,
}));
vi.mock('@/features/fittings/dogmaEngineAssets', () => ({
  dogmaEngineAssetsCached: mocks.dogmaEngineAssetsCached,
}));

import {
  cancelDownload,
  downloadEverything,
  isDownloading,
  readOfflineStatus,
  readStorageEstimate,
} from './offlineStatus';

afterEach(() => {
  vi.clearAllMocks();
  mocks.hasControllingServiceWorker.mockReturnValue(true);
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
    expect(status.total).toBe(74);
  });
});

describe('readOfflineStatus with build chunks', () => {
  const CHUNKS = ['assets/A-1.js', 'assets/B-2.js', 'assets/C-3.js'];

  it('lists the app pages as a pack and adds them to the totals', async () => {
    mocks.cachedLazySdeFiles.mockResolvedValue(new Set());
    mocks.dogmaEngineAssetsCached.mockResolvedValue(false);
    mocks.fetchLazyChunkList.mockResolvedValue(CHUNKS);
    mocks.cachedLazyChunks.mockResolvedValue(new Set([CHUNKS[0]]));
    const status = await readOfflineStatus();
    expect(status.packs.find((pack) => pack.id === 'appPages')).toMatchObject({
      total: 3,
      cached: 1,
      state: 'partial',
    });
    expect(status.total).toBe(74 + 3);
    expect(status.totalCached).toBe(1);
  });

  it('shows no app pages pack when the list cannot be read', async () => {
    mocks.cachedLazySdeFiles.mockResolvedValue(new Set());
    mocks.dogmaEngineAssetsCached.mockResolvedValue(false);
    mocks.fetchLazyChunkList.mockResolvedValue([]);
    const status = await readOfflineStatus();
    expect(status.packs.some((pack) => pack.id === 'appPages')).toBe(false);
    expect(status.total).toBe(74);
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
  it('runs the forced warm, passes progress through and says it finished', async () => {
    mocks.warmLazySde.mockImplementation(async (_signal, options) => {
      options.onProgress(3, 74);
      return [];
    });
    const onProgress = vi.fn();
    await expect(downloadEverything(onProgress)).resolves.toBe('done');
    expect(mocks.warmLazySde).toHaveBeenCalledWith(
      { cancelled: false },
      expect.objectContaining({ force: true })
    );
    expect(onProgress).toHaveBeenCalledWith(3, 74);
    expect(isDownloading()).toBe(false);
  });

  it('names the missing service worker instead of pretending the files failed', async () => {
    mocks.hasControllingServiceWorker.mockReturnValue(false);
    mocks.warmLazySde.mockResolvedValue([]);
    await expect(downloadEverything(() => {})).resolves.toBe('no-service-worker');
  });

  it('joins a run under way rather than starting a second one', async () => {
    let finish: () => void = () => {};
    mocks.warmLazySde.mockImplementation(async (_signal, options) => {
      options.onProgress(5, 74);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return [];
    });
    const first = vi.fn();
    const second = vi.fn();
    const a = downloadEverything(first);
    const b = downloadEverything(second);
    expect(isDownloading()).toBe(true);
    await vi.waitFor(() => expect(first).toHaveBeenCalledWith(5, 74));
    // The late joiner hears the latest figure at once.
    expect(second).toHaveBeenCalledWith(5, 74);
    finish();
    await expect(Promise.all([a, b])).resolves.toEqual(['done', 'done']);
    expect(mocks.warmLazySde).toHaveBeenCalledOnce();
  });

  it('cancels, reports it, and starts a fresh pass for the next call', async () => {
    let signalSeen: { cancelled: boolean } | null = null;
    let finish: () => void = () => {};
    mocks.warmLazySde.mockImplementationOnce(async (signal) => {
      signalSeen = signal;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return [];
    });
    const first = downloadEverything(() => {});
    await vi.waitFor(() => expect(signalSeen).not.toBeNull());
    cancelDownload();
    expect(isDownloading()).toBe(false);
    expect((signalSeen as { cancelled: boolean } | null)?.cancelled).toBe(true);

    mocks.warmLazySde.mockResolvedValueOnce([]);
    const next = downloadEverything(() => {});
    finish();
    await expect(first).resolves.toBe('cancelled');
    await expect(next).resolves.toBe('done');
    expect(mocks.warmLazySde).toHaveBeenCalledTimes(2);
  });
});
