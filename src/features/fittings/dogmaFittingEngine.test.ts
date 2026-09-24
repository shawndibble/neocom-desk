import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';

const wasmInitMock = vi.fn<(init: { module_or_path: ArrayBuffer }) => Promise<void>>(
  async () => {}
);
const calculateMock = vi.fn<(fit: { ship: { type_id: number } }) => unknown>();
const loadSdeMock = vi.fn<(bytes: Uint8Array) => number>();

vi.mock('@eveshipfit/dogma-engine', () => ({
  default: (init: { module_or_path: ArrayBuffer }) => wasmInitMock(init),
  calculate: (fit: { ship: { type_id: number } }) => calculateMock(fit),
  load_sde: (bytes: Uint8Array) => loadSdeMock(bytes),
}));

function fakeResponse(bytes: Uint8Array, contentLength?: number): Response {
  return new Response(new Blob([bytes.buffer as ArrayBuffer]), {
    status: 200,
    headers: contentLength === undefined ? {} : { 'content-length': String(contentLength) },
  });
}

const WASM_BYTES = new Uint8Array([1, 2, 3, 4]);
const SDE_BYTES = new Uint8Array([5, 6, 7, 8, 9]);

function stubNetwork() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('esf_dogma_engine_bg.wasm'))
      return fakeResponse(WASM_BYTES, WASM_BYTES.byteLength);
    if (url.includes('sde.dat')) return fakeResponse(SDE_BYTES, SDE_BYTES.byteLength);
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  const store = new Map<string, Response>();
  const cache: Partial<Cache> = {
    match: vi.fn(async (key: RequestInfo | URL) => store.get(String(key))),
    put: vi.fn(async (key: RequestInfo | URL, response: Response) => {
      store.set(String(key), response);
    }),
  };
  const cachesMock: Partial<CacheStorage> = { open: vi.fn(async () => cache as Cache) };
  vi.stubGlobal('caches', cachesMock);

  return { fetchMock, cache, store };
}

async function freshModule() {
  vi.resetModules();
  return import('./dogmaFittingEngine');
}

const fitting: Fitting = {
  name: 'Test Fit',
  shipTypeId: 17843,
  modules: [],
  drones: [],
  cargo: [],
};
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [] };

describe('loadDogmaEngine', () => {
  beforeEach(() => {
    wasmInitMock.mockClear();
    loadSdeMock.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the wasm and sde files, then initializes the engine with their bytes', async () => {
    stubNetwork();
    const { loadDogmaEngine } = await freshModule();

    await loadDogmaEngine();

    expect(wasmInitMock).toHaveBeenCalledTimes(1);
    const [{ module_or_path }] = wasmInitMock.mock.calls[0];
    expect(new Uint8Array(module_or_path)).toEqual(WASM_BYTES);

    expect(loadSdeMock).toHaveBeenCalledTimes(1);
    const [sdeArg] = loadSdeMock.mock.calls[0];
    expect(sdeArg).toEqual(SDE_BYTES);
  });

  it('reports combined progress across both downloads as bytes stream in', async () => {
    stubNetwork();
    const { loadDogmaEngine } = await freshModule();
    const reports: Array<{ loadedBytes: number; totalBytes: number | null }> = [];

    await loadDogmaEngine((progress) => reports.push({ ...progress }));

    expect(reports.length).toBeGreaterThan(0);
    const last = reports[reports.length - 1];
    expect(last.totalBytes).toBe(WASM_BYTES.byteLength + SDE_BYTES.byteLength);
    expect(last.loadedBytes).toBe(WASM_BYTES.byteLength + SDE_BYTES.byteLength);
  });

  it('loads only once: a second call reuses the first, already-resolved load', async () => {
    const { fetchMock } = stubNetwork();
    const { loadDogmaEngine } = await freshModule();

    await loadDogmaEngine();
    await loadDogmaEngine();

    expect(fetchMock).toHaveBeenCalledTimes(2); // wasm + sde, once each — not four times
  });

  it('serves the second load from the Cache Storage entry the first load wrote, without refetching', async () => {
    const { fetchMock } = stubNetwork();
    const { loadDogmaEngine } = await freshModule();
    await loadDogmaEngine();
    vi.resetModules();
    const { loadDogmaEngine: loadAgain } = await import('./dogmaFittingEngine');

    await loadAgain();

    expect(fetchMock).toHaveBeenCalledTimes(2); // still just the first module's two fetches
  });

  it('clears the failed load so a later call can retry instead of rejecting forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => {}),
      })),
    });
    const { loadDogmaEngine } = await freshModule();

    await expect(loadDogmaEngine()).rejects.toThrow('offline');

    stubNetwork();
    await expect(loadDogmaEngine()).resolves.toBeUndefined();
  });
});

describe('computeFittingStats', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the engine, maps the fitting, calculates, and extracts stats from the result', async () => {
    stubNetwork();
    calculateMock.mockReturnValue({
      ship: {
        attributes: new Map([
          [48, { value: 400 }],
          [-9, { value: 100 }],
        ]),
      },
      items: [],
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(fitting, profile);

    expect(calculateMock).toHaveBeenCalledTimes(1);
    const [dogmaFit] = calculateMock.mock.calls[0];
    expect(dogmaFit.ship).toEqual({ type_id: 17843 });
    expect(stats.cpuTotal).toBe(400);
    expect(stats.cpuUsed).toBe(300);
  });
});
