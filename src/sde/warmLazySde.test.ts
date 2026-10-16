import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAZY_SDE_FILES, cachedLazySdeFiles, warmLazySde } from './warmLazySde';

const warmDogma = vi.fn(async () => {});
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({ warmDogmaEngineAssets: warmDogma }));

const fetchMock = vi.fn<(url: string) => Promise<Response>>(
  async () => new Response('{}', { status: 200 })
);

function env(opts: { controller?: boolean; online?: boolean; connection?: object }) {
  vi.stubGlobal('navigator', {
    onLine: opts.online ?? true,
    serviceWorker: { controller: opts.controller === false ? null : {} },
    connection: opts.connection,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('caches', { match: vi.fn(async () => undefined) });
  vi.stubGlobal('__SDE_DATA_VERSIONS__', {});
});
afterEach(() => vi.unstubAllGlobals());

describe('warmLazySde', () => {
  it('fetches every lazy file once, then the engine, within the sde-data entry cap', async () => {
    env({});
    await warmLazySde({ cancelled: false });
    expect(fetchMock).toHaveBeenCalledTimes(LAZY_SDE_FILES.length);
    const fetched = fetchMock.mock.calls.map(([url]) => String(url));
    LAZY_SDE_FILES.forEach((file, i) => expect(fetched[i]).toContain(`data/${file}`));
    // ~2x headroom under `sw.ts`'s sde-data maxEntries (150) for stale `?v=` entries.
    expect(LAZY_SDE_FILES.length * 2).toBeLessThanOrEqual(150);
    expect(warmDogma).toHaveBeenCalledOnce();
  });

  it('does nothing without a controlling service worker', async () => {
    env({ controller: false });
    await warmLazySde({ cancelled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing offline or under Save-Data', async () => {
    env({ online: false });
    await warmLazySde({ cancelled: false });
    env({ connection: { saveData: true } });
    await warmLazySde({ cancelled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the engine on cellular but still warms the small files', async () => {
    env({ connection: { effectiveType: '4g', type: 'cellular' } });
    await warmLazySde({ cancelled: false });
    expect(fetchMock).toHaveBeenCalledTimes(LAZY_SDE_FILES.length);
    expect(warmDogma).not.toHaveBeenCalled();
  });

  it('skips files already cached', async () => {
    env({});
    vi.stubGlobal('caches', { match: vi.fn(async () => new Response('x')) });
    await warmLazySde({ cancelled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps warming after one file fails, and reports which failed', async () => {
    env({});
    fetchMock.mockRejectedValueOnce(new Error('reset'));
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    const failed = await warmLazySde({ cancelled: false });
    expect(failed).toEqual([LAZY_SDE_FILES[0], LAZY_SDE_FILES[1]]);
    expect(fetchMock).toHaveBeenCalledTimes(LAZY_SDE_FILES.length);
    expect(warmDogma).toHaveBeenCalledOnce();
  });

  it('reports nothing failed on a clean pass', async () => {
    env({});
    await expect(warmLazySde({ cancelled: false })).resolves.toEqual([]);
  });

  it('stops quietly when the connection drops mid-pass', async () => {
    env({});
    fetchMock.mockImplementationOnce(async () => {
      env({ online: false });
      return new Response('{}', { status: 200 });
    });
    await expect(warmLazySde({ cancelled: false })).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warmDogma).not.toHaveBeenCalled();
  });
});

describe('warmLazySde force', () => {
  it('ignores Save-Data and cellular, and still warms the engine', async () => {
    env({ connection: { saveData: true, effectiveType: '3g', type: 'cellular' } });
    await warmLazySde({ cancelled: false }, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(LAZY_SDE_FILES.length);
    expect(warmDogma).toHaveBeenCalledOnce();
  });

  it('still does nothing offline or without a controlling service worker', async () => {
    env({ online: false });
    await warmLazySde({ cancelled: false }, { force: true });
    env({ controller: false });
    await warmLazySde({ cancelled: false }, { force: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warmDogma).not.toHaveBeenCalled();
  });

  it('reports progress out of files plus the engine', async () => {
    env({});
    const onProgress = vi.fn();
    await warmLazySde({ cancelled: false }, { force: true, onProgress });
    const total = LAZY_SDE_FILES.length + 1;
    expect(onProgress).toHaveBeenCalledTimes(total);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, total);
    expect(onProgress).toHaveBeenLastCalledWith(total, total);
  });
});

describe('cachedLazySdeFiles', () => {
  it('lists the lazy files whose versioned URL is in Cache Storage', async () => {
    vi.stubGlobal('__SDE_DATA_VERSIONS__', { 'masteries.json': 'abc' });
    const match = vi.fn(async (url: string) =>
      url.endsWith('data/masteries.json?v=abc') || url.endsWith('data/typeNames.json')
        ? new Response('x')
        : undefined
    );
    vi.stubGlobal('caches', { match });
    const cached = await cachedLazySdeFiles();
    expect([...cached].sort()).toEqual(['masteries.json', 'typeNames.json']);
  });

  it('reports nothing cached when Cache Storage is unavailable', async () => {
    vi.stubGlobal('caches', undefined);
    expect((await cachedLazySdeFiles()).size).toBe(0);
  });
});
