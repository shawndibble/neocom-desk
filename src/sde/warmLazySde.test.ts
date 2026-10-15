import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAZY_SDE_FILES, warmLazySde } from './warmLazySde';

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
    expect(LAZY_SDE_FILES.length).toBeLessThanOrEqual(64);
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
