import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENGINE_ITEM,
  LAZY_ASSET_TOTAL,
  LAZY_SDE_FILES,
  cachedLazySdeFiles,
  warmFittingAssets,
  warmLazySde,
} from './warmLazySde';
import { LAZY_SDE_PRIORITY_COUNT } from './lazySdeFiles';

const warmDogma = vi.fn(async () => {});
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({ warmDogmaEngineAssets: warmDogma }));

const fetchMock = vi.fn<(url: string) => Promise<Response>>(
  async () => new Response('{}', { status: 200 })
);

// What `lazy-chunks.json` names. Empty by default, so the SDE tests count only SDE fetches.
const chunkList = { files: [] as string[] };
const chunkFetch = vi.fn<(url: string) => Promise<Response>>();
function routedFetch(url: string, init?: RequestInit) {
  if (String(url).endsWith('lazy-chunks.json')) {
    expect(init?.cache).toBe('no-store');
    return Promise.resolve(Response.json({ release: 'r', files: chunkList.files }));
  }
  if (String(url).includes('/assets/')) return chunkFetch(String(url));
  return fetchMock(String(url));
}

function env(opts: { controller?: boolean; online?: boolean; connection?: object }) {
  vi.stubGlobal('navigator', {
    onLine: opts.online ?? true,
    serviceWorker: { controller: opts.controller === false ? null : {} },
    connection: opts.connection,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  chunkList.files = [];
  chunkFetch.mockReset().mockImplementation(async () => new Response('x', { status: 200 }));
  vi.stubGlobal('fetch', routedFetch);
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

  it('still does nothing offline', async () => {
    env({ online: false });
    await warmLazySde({ cancelled: false }, { force: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warmDogma).not.toHaveBeenCalled();
  });

  it('without a controlling service worker skips the files but still fetches the engine', async () => {
    env({ controller: false });
    const onProgress = vi.fn();
    await warmLazySde({ cancelled: false }, { force: true, onProgress });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warmDogma).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenLastCalledWith(LAZY_ASSET_TOTAL, LAZY_ASSET_TOTAL);
  });

  it('stops when cancelled', async () => {
    env({});
    const signal = { cancelled: false };
    fetchMock.mockImplementationOnce(async () => {
      signal.cancelled = true;
      return new Response('{}', { status: 200 });
    });
    await warmLazySde(signal, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warmDogma).not.toHaveBeenCalled();
  });

  it('reports progress out of files plus the engine', async () => {
    env({});
    const onProgress = vi.fn();
    await warmLazySde({ cancelled: false }, { force: true, onProgress });
    const total = LAZY_ASSET_TOTAL;
    expect(onProgress).toHaveBeenCalledTimes(total);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, total);
    expect(onProgress).toHaveBeenLastCalledWith(total, total);
  });
});

describe('warming the build chunks', () => {
  const FILES = Array.from({ length: 20 }, (_, i) => `assets/Route${i}-hash.js`);
  const fetchedChunks = () => chunkFetch.mock.calls.map(([url]) => String(url));

  beforeEach(() => {
    chunkList.files = FILES;
  });

  it('fetches every listed chunk, after the SDE files and the engine', async () => {
    env({});
    const order: string[] = [];
    fetchMock.mockImplementation(async () => (order.push('sde'), new Response('{}')));
    chunkFetch.mockImplementation(async () => (order.push('chunk'), new Response('x')));
    await warmLazySde({ cancelled: false });
    expect(fetchedChunks()).toEqual(FILES.map((file) => `/${file}`));
    expect(order.indexOf('chunk')).toBeGreaterThan(order.lastIndexOf('sde'));
  });

  it('keeps a handful in flight, never one by one and never all at once', async () => {
    env({});
    let inFlight = 0;
    let peak = 0;
    chunkFetch.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return new Response('x');
    });
    await warmLazySde({ cancelled: false });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it('leaves them alone on cellular or Save-Data, where the SDE files still warm', async () => {
    env({ connection: { saveData: true } });
    await warmLazySde({ cancelled: false });
    expect(chunkFetch).not.toHaveBeenCalled();
    env({ connection: { effectiveType: '4g', type: 'cellular' } });
    await warmLazySde({ cancelled: false });
    expect(chunkFetch).not.toHaveBeenCalled();
  });

  it('fetches them when the pilot forces the download, past that gate', async () => {
    env({ connection: { saveData: true } });
    await warmLazySde({ cancelled: false }, { force: true });
    expect(chunkFetch).toHaveBeenCalledTimes(FILES.length);
  });

  it('needs a controlling service worker: without one nothing would store them', async () => {
    env({ controller: false });
    await warmLazySde({ cancelled: false }, { force: true });
    expect(chunkFetch).not.toHaveBeenCalled();
  });

  it('skips chunks already in Cache Storage', async () => {
    env({});
    vi.stubGlobal('caches', {
      match: vi.fn(async (url: string) => (url === `/${FILES[0]}` ? new Response('x') : undefined)),
    });
    await warmLazySde({ cancelled: false });
    expect(fetchedChunks()).not.toContain(`/${FILES[0]}`);
    expect(chunkFetch).toHaveBeenCalledTimes(FILES.length - 1);
  });

  it('reports the chunks that failed and keeps going', async () => {
    env({});
    chunkFetch.mockImplementation(async (url) =>
      url.endsWith(FILES[3]) ? new Response('no', { status: 404 }) : new Response('x')
    );
    const failed = await warmLazySde({ cancelled: false });
    expect(failed).toEqual([FILES[3]]);
    expect(chunkFetch).toHaveBeenCalledTimes(FILES.length);
  });

  it('counts them in the progress total, ending at the whole', async () => {
    env({});
    const onProgress = vi.fn();
    await warmLazySde({ cancelled: false }, { force: true, onProgress });
    const total = LAZY_ASSET_TOTAL + FILES.length;
    expect(onProgress).toHaveBeenCalledTimes(total);
    expect(onProgress).toHaveBeenLastCalledWith(total, total);
  });

  it('stops taking chunks when cancelled', async () => {
    env({});
    const signal = { cancelled: false };
    chunkFetch.mockImplementation(async () => {
      signal.cancelled = true;
      return new Response('x');
    });
    await warmLazySde(signal, { force: true });
    expect(chunkFetch.mock.calls.length).toBeLessThan(FILES.length);
  });

  it('warms nothing extra when the list cannot be read', async () => {
    env({});
    chunkList.files = [];
    await warmLazySde({ cancelled: false });
    expect(chunkFetch).not.toHaveBeenCalled();
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

describe('overlapping passes', () => {
  it('fetch each file once when the background warm and a forced pass run together', async () => {
    env({});
    // A real cache: a finished fetch is found by whichever pass arrives later.
    const stored = new Set<string>();
    vi.stubGlobal('caches', {
      match: vi.fn(async (url: string) => (stored.has(url) ? new Response('x') : undefined)),
    });
    fetchMock.mockImplementation(async (url) => {
      stored.add(String(url));
      return new Response('{}', { status: 200 });
    });
    await Promise.all([
      warmLazySde({ cancelled: false }),
      warmLazySde({ cancelled: false }, { force: true }),
    ]);
    const fetched = fetchMock.mock.calls.map(([url]) => String(url));
    expect(fetched).toHaveLength(LAZY_SDE_FILES.length);
    expect(new Set(fetched).size).toBe(LAZY_SDE_FILES.length);
  });
});

describe('engine import failure', () => {
  it('reports the engine as failed and still finishes the progress', async () => {
    env({});
    warmDogma.mockRejectedValueOnce(new Error('chunk failed'));
    const onProgress = vi.fn();
    const failed = await warmLazySde({ cancelled: false }, { onProgress });
    expect(failed).toEqual([ENGINE_ITEM]);
    expect(onProgress).toHaveBeenLastCalledWith(LAZY_ASSET_TOTAL, LAZY_ASSET_TOTAL);
  });
});

describe('warm order', () => {
  it('fetches the dogma engine after the priority files and before the low-value rest', async () => {
    env({});
    let fetchedWhenEngineRan = 0;
    warmDogma.mockImplementationOnce(async () => {
      fetchedWhenEngineRan = fetchMock.mock.calls.length;
    });
    await warmLazySde({ cancelled: false });
    expect(fetchedWhenEngineRan).toBe(LAZY_SDE_PRIORITY_COUNT);
    expect(LAZY_SDE_FILES[0]).toMatch(/^typeInfo\//);
    expect(LAZY_SDE_FILES[LAZY_SDE_PRIORITY_COUNT]).toBe('masteries.json');
  });

  it('on cellular still warms the files after the skipped engine', async () => {
    env({ connection: { type: 'cellular' } });
    const progress = vi.fn();
    await warmLazySde({ cancelled: false }, { onProgress: progress });
    expect(progress).toHaveBeenLastCalledWith(LAZY_ASSET_TOTAL, LAZY_ASSET_TOTAL);
  });

  it('a second pass (a reconnect) fetches only what the first missed', async () => {
    env({});
    fetchMock.mockRejectedValueOnce(new Error('reset'));
    const cached = new Set<string>();
    vi.stubGlobal('caches', {
      match: vi.fn(async (url: string) => (cached.has(url) ? new Response('x') : undefined)),
    });
    fetchMock.mockImplementation(async (url) => {
      cached.add(String(url));
      return new Response('{}', { status: 200 });
    });
    const first = await warmLazySde({ cancelled: false });
    expect(first).toEqual([LAZY_SDE_FILES[0]]);
    fetchMock.mockClear();
    await warmLazySde({ cancelled: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`data/${LAZY_SDE_FILES[0]}`);
  });
});

describe('warmFittingAssets', () => {
  it('warms the engine on wifi, with or without a service worker', async () => {
    env({ controller: false });
    await warmFittingAssets();
    expect(warmDogma).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['cellular', { type: 'cellular' }],
    ['Save-Data', { saveData: true }],
    ['2g', { effectiveType: '2g' }],
  ])('does not auto-download the engine on %s', async (_n, connection) => {
    env({ connection });
    await warmFittingAssets();
    expect(warmDogma).not.toHaveBeenCalled();
  });

  it('does nothing offline', async () => {
    env({ online: false });
    await warmFittingAssets();
    expect(warmDogma).not.toHaveBeenCalled();
  });

  it('swallows a failing engine chunk', async () => {
    env({});
    warmDogma.mockRejectedValueOnce(new Error('chunk'));
    await expect(warmFittingAssets()).resolves.toBeUndefined();
  });
});
