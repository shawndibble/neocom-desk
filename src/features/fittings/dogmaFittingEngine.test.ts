import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';

const wasmInitMock = vi.fn<(init: { module_or_path: ArrayBuffer }) => Promise<void>>(
  async () => {}
);
type MockFit = {
  ship: { type_id: number };
  items: {
    type_id: number;
    slot: { type: string };
    state?: string;
    charge?: { type_id: number };
  }[];
};
const calculateMock = vi.fn<(fit: MockFit, options?: { validate?: boolean }) => unknown>();
const loadSdeMock = vi.fn<(bytes: Uint8Array) => number>();

const beaconMock = vi.fn((typeId: number) => ({ effects: [{ fromBeacon: typeId }] }));
vi.mock('@eveshipfit/dogma-engine', () => ({
  beacon: (typeId: number) => beaconMock(typeId),
  default: (init: { module_or_path: ArrayBuffer }) => wasmInitMock(init),
  calculate: (fit: MockFit, options?: { validate?: boolean }) => calculateMock(fit, options),
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
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

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

  it("rejects a 200 that is the app's HTML fallback page, and never caches it", async () => {
    const { fetchMock, cache } = stubNetwork();
    fetchMock.mockImplementation(
      async () =>
        new Response('<!doctype html><title>Neocom Desk</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
    );
    const { loadDogmaEngine } = await freshModule();

    await expect(loadDogmaEngine()).rejects.toThrow(/esf_dogma_engine_bg\.wasm|sde\.dat/);
    expect(cache.put).not.toHaveBeenCalled();
    expect(wasmInitMock).not.toHaveBeenCalled();
  });

  it('refetches over a cached HTML page left by an earlier, poisoned load', async () => {
    const { fetchMock, store } = stubNetwork();
    const html = () =>
      new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    store.set('/vendor/dogma/esf_dogma_engine_bg.wasm', html());
    store.set('/vendor/dogma/sde.dat', html());
    const { loadDogmaEngine } = await freshModule();

    await loadDogmaEngine();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Uint8Array(wasmInitMock.mock.calls[0][0].module_or_path)).toEqual(WASM_BYTES);
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
      character: { attributes: new Map() },
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(fitting, profile);

    expect(calculateMock).toHaveBeenCalledTimes(1);
    const [dogmaFit] = calculateMock.mock.calls[0];
    expect(dogmaFit.ship).toEqual({ type_id: 17843 });
    expect(stats.cpuTotal).toBe(400);
    expect(stats.cpuUsed).toBe(300);
    expect(stats.applied).toEqual({ weapons: [], droneControlRange: 20000 });
  });

  it('adds the weather to what a fit already takes in, rather than replacing it', async () => {
    const { withWeather } = await freshModule();
    const fit = {
      name: 'x',
      ship: { type_id: 1 },
      items: [],
      incoming: { effects: [{ fromFleet: true }], buffs: [{ id: 10 }] },
    } as unknown as Parameters<typeof withWeather>[0];
    expect(withWeather(fit, 47390).incoming).toEqual({
      effects: [{ fromFleet: true }, { fromBeacon: 47390 }],
      buffs: [{ id: 10 }],
    });
  });

  it("hands the engine a weather's beacon as what the fit takes in — and nothing without one", async () => {
    stubNetwork();
    calculateMock.mockReturnValue({
      ship: { attributes: new Map() },
      items: [],
      character: { attributes: new Map() },
    });
    const { computeFittingStats } = await freshModule();

    await computeFittingStats(fitting, profile, undefined, undefined, { weatherTypeId: 47390 });
    await computeFittingStats(fitting, profile);

    const [[inWeather], [clear]] = calculateMock.mock.calls.slice(-2) as unknown as [
      { incoming?: unknown }[],
      { incoming?: unknown }[],
    ];
    expect(inWeather.incoming).toEqual({ effects: [{ fromBeacon: 47390 }], buffs: [] });
    expect(clear.incoming).toBeUndefined();
  });

  it('sums calibration cost across fitted rigs and bandwidth across active drones only', async () => {
    stubNetwork();
    const fittingWithRigAndDrones: Fitting = {
      name: 'Test Fit',
      shipTypeId: 17843,
      modules: [{ slot: 'rig', slotIndex: 0, typeId: 31105, state: 'online' }],
      drones: [
        { typeId: 2454, quantity: 3, state: 'active' },
        { typeId: 2454, quantity: 2, state: 'online' }, // in the bay, not deployed — draws no bandwidth
      ],
      cargo: [],
    };
    calculateMock.mockReturnValue({
      ship: { attributes: new Map() },
      items: [
        { attributes: new Map([[1153, { value: 100 }]]) }, // the rig
        { attributes: new Map([[1272, { value: 5 }]]) }, // active drone stack
        { attributes: new Map([[1272, { value: 5 }]]) }, // bay drone stack
      ],
      character: { attributes: new Map() },
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(fittingWithRigAndDrones, profile);

    expect(stats.calibrationUsed).toBe(100);
    expect(stats.droneBandwidthUsed).toBe(15); // 5 Mbit x 3 active, bay stack excluded
  });
});

describe('computeFittingStats module results', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports each module's reached and highest state, index-parallel to the fitting's modules", async () => {
    stubNetwork();
    calculateMock.mockReturnValue({
      ship: { attributes: new Map() },
      items: [
        { attributes: new Map([[604, { value: 83 }]]), state: 'active', max_state: 'overload' },
        { attributes: new Map(), state: 'online', max_state: 'online' },
      ],
      character: { attributes: new Map() },
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(
      {
        ...fitting,
        modules: [
          { slot: 'high', slotIndex: 0, typeId: 2889, state: 'active' },
          { slot: 'low', slotIndex: 0, typeId: 2048, state: 'active' },
        ],
      },
      profile
    );

    expect(stats.modules).toEqual([
      { state: 'active', maxState: 'overload', chargeGroupIds: [83] },
      { state: 'online', maxState: 'online', chargeGroupIds: [] },
    ]);
  });
});

describe('computeFittingStats overheated values', () => {
  afterEach(() => vi.unstubAllGlobals());

  const DPS = -12;
  const VOLLEY = -21;
  const EHP = -43;

  it('recalculates with every heatable active module overloaded and reads overheated values off it', async () => {
    stubNetwork();
    calculateMock.mockReset();
    calculateMock.mockImplementation((fit) => {
      const heated = fit.items[0].state === 'overload';
      return {
        ship: { attributes: new Map([[EHP, { value: heated ? 1200 : 1000 }]]) },
        items: [
          {
            attributes: new Map([
              [DPS, { value: heated ? 12 : 10 }],
              [VOLLEY, { value: 50 }],
            ]),
            state: heated ? 'overload' : 'active',
            max_state: 'overload',
          },
          { attributes: new Map(), state: 'active', max_state: 'active' },
          {
            attributes: new Map([
              [DPS, { value: 4 }],
              [VOLLEY, { value: 16 }],
            ]),
            state: 'active',
            max_state: 'active',
          },
        ],
        character: { attributes: new Map() },
      };
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(
      {
        ...fitting,
        modules: [
          { slot: 'high', slotIndex: 0, typeId: 3186, state: 'active', chargeTypeId: 230 },
          { slot: 'low', slotIndex: 0, typeId: 2048, state: 'active' },
        ],
        drones: [{ typeId: 2488, quantity: 5, state: 'active' }],
      },
      profile
    );

    expect(calculateMock).toHaveBeenCalledTimes(2);
    const heatedFit = calculateMock.mock.calls[1][0];
    expect(heatedFit.items.map((item) => item.state)).toEqual(['overload', 'active', 'active']);
    expect(stats.offense.weapons).toEqual([
      expect.objectContaining({
        typeId: 3186,
        count: 1,
        dps: 10,
        overheated: { dps: 12, volley: 50 },
      }),
      expect.objectContaining({ typeId: 2488, count: 5, dps: 20, overheated: null }),
    ]);
    expect(stats.offense.dps).toBe(30);
    expect(stats.offense.overheated?.dps).toBe(32);
    expect(stats.ehp).toBe(1000);
    expect(stats.overheated?.ehp).toBe(1200);
  });

  it('calculates once and reports no overheated values when no module can overheat', async () => {
    stubNetwork();
    calculateMock.mockReset();
    calculateMock.mockReturnValue({
      ship: { attributes: new Map() },
      items: [{ attributes: new Map(), state: 'online', max_state: 'online' }],
      character: { attributes: new Map() },
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(
      { ...fitting, modules: [{ slot: 'low', slotIndex: 0, typeId: 2048, state: 'online' }] },
      profile
    );

    expect(calculateMock).toHaveBeenCalledTimes(1);
    expect(stats.overheated).toBeNull();
    expect(stats.offense.overheated).toBeNull();
  });

  it('reads every figure off the overloaded calculation when everything is overheated, keeping the editor’s module states', async () => {
    stubNetwork();
    calculateMock.mockReset();
    calculateMock.mockImplementation((fit) => {
      const heated = fit.items[0].state === 'overload';
      return {
        ship: { attributes: new Map([[EHP, { value: heated ? 1200 : 1000 }]]) },
        items: [
          {
            attributes: new Map([[DPS, { value: heated ? 12 : 10 }]]),
            state: heated ? 'overload' : 'active',
            max_state: 'overload',
          },
        ],
        character: { attributes: new Map() },
      };
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(
      { ...fitting, modules: [{ slot: 'high', slotIndex: 0, typeId: 3186, state: 'active' }] },
      profile,
      undefined,
      undefined,
      { overheatAll: true }
    );

    expect(stats.allOverheated).toBe(true);
    expect(stats.ehp).toBe(1200);
    expect(stats.offense.dps).toBe(12);
    // The heated figures are the figures now; there's no second number beside them.
    expect(stats.overheated).toBeNull();
    expect(stats.offense.overheated).toBeNull();
    // The state control still shows what the pilot set.
    expect(stats.modules[0].state).toBe('active');
  });

  it('is not overheated at all when nothing can overheat, whatever was asked', async () => {
    stubNetwork();
    calculateMock.mockReset();
    calculateMock.mockReturnValue({
      ship: { attributes: new Map() },
      items: [{ attributes: new Map(), state: 'online', max_state: 'online' }],
      character: { attributes: new Map() },
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(
      { ...fitting, modules: [{ slot: 'low', slotIndex: 0, typeId: 2048, state: 'online' }] },
      profile,
      undefined,
      undefined,
      { overheatAll: true }
    );
    expect(stats.allOverheated).toBe(false);
    expect(calculateMock).toHaveBeenCalledTimes(1);
  });

  it('skips the overheated calculation when asked to', async () => {
    stubNetwork();
    calculateMock.mockReset();
    calculateMock.mockReturnValue({
      ship: { attributes: new Map() },
      items: [{ attributes: new Map(), state: 'active', max_state: 'overload' }],
      character: { attributes: new Map() },
    });
    const { computeFittingStats } = await freshModule();

    const stats = await computeFittingStats(
      { ...fitting, modules: [{ slot: 'high', slotIndex: 0, typeId: 3186, state: 'active' }] },
      profile,
      undefined,
      undefined,
      { overheated: false }
    );

    expect(calculateMock).toHaveBeenCalledTimes(1);
    expect(stats.overheated).toBeNull();
  });
});

describe('fit checks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is not ready, and refuses to check, before the engine has loaded', async () => {
    const { isDogmaEngineReady, checkCandidates } = await freshModule();
    expect(isDogmaEngineReady()).toBe(false);
    expect(() => checkCandidates(587, 'low', [2048], profile)).toThrow();
  });

  it('checks each candidate alone on the hull, reading its own rules and the hull-level ones it causes', async () => {
    stubNetwork();
    calculateMock.mockImplementation((fit) => {
      const typeId = fit.items[0].type_id;
      const violations = [
        // The hull itself needing a skill says nothing about the candidate.
        { target: { type: 'ship' }, rule: { type: 'skill' } },
        ...(typeId === 1
          ? [{ target: { type: 'item', index: 0 }, rule: { type: 'wrong_slot' } }]
          : []),
        ...(typeId === 2 ? [{ target: { type: 'item', index: 0 }, rule: { type: 'skill' } }] : []),
        // No launcher hardpoint: the engine reports it against the ship.
        ...(typeId === 4 ? [{ target: { type: 'ship' }, rule: { type: 'slots' } }] : []),
        // More powergrid than the bare hull has: also reported against the ship.
        ...(typeId === 5
          ? [{ target: { type: 'ship' }, rule: { type: 'resource', resource: 'powergrid' } }]
          : []),
      ];
      return { ship: { attributes: new Map() }, items: [], violations };
    });
    const { loadDogmaEngine, isDogmaEngineReady, checkCandidates } = await freshModule();
    await loadDogmaEngine();
    expect(isDogmaEngineReady()).toBe(true);
    calculateMock.mockClear();

    const result = checkCandidates(587, 'low', [1, 2, 3, 4, 5], profile);

    expect(result.get(1)).toEqual({ fitsHull: false, canFly: true, fitsResources: true });
    expect(result.get(2)).toEqual({ fitsHull: true, canFly: false, fitsResources: true });
    expect(result.get(3)).toEqual({ fitsHull: true, canFly: true, fitsResources: true });
    expect(result.get(4)).toEqual({ fitsHull: false, canFly: true, fitsResources: true });
    expect(result.get(5)).toEqual({ fitsHull: true, canFly: true, fitsResources: false });
    expect(calculateMock.mock.calls[0][0].items[0].slot).toEqual({ type: 'low', index: 0 });
    expect(calculateMock.mock.calls[0][1]).toEqual({ validate: true });

    // Memoized per hull + rack + profile: asking again recalculates nothing.
    calculateMock.mockClear();
    checkCandidates(587, 'low', [1, 2, 3, 4], profile);
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it('puts a drone candidate in the drone bay', async () => {
    stubNetwork();
    calculateMock.mockReturnValue({ ship: { attributes: new Map() }, items: [], violations: [] });
    const { loadDogmaEngine, checkCandidates } = await freshModule();
    await loadDogmaEngine();
    calculateMock.mockClear();

    checkCandidates(587, 'drone', [2454], profile);

    expect(calculateMock.mock.calls[0][0].items[0].slot).toEqual({ type: 'drone_bay' });
  });

  it('keeps the charges a module accepts, dropping wrong group, wrong size or too big', async () => {
    stubNetwork();
    calculateMock.mockImplementation((fit) => {
      const chargeId = fit.items[0].charge?.type_id;
      const violations =
        chargeId === 10
          ? [{ target: { type: 'charge', index: 0 }, rule: { type: 'charge_size' } }]
          : chargeId === 11
            ? [
                {
                  target: { type: 'item', index: 0 },
                  rule: { type: 'resource', resource: 'charge_capacity' },
                },
              ]
            : chargeId === 12
              ? [{ target: { type: 'charge', index: 0 }, rule: { type: 'skill' } }]
              : [];
      return { ship: { attributes: new Map() }, items: [], violations };
    });
    const { loadDogmaEngine, checkCharges } = await freshModule();
    await loadDogmaEngine();

    const fitting = checkCharges(587, { slot: 'high', typeId: 2889 }, [9, 10, 11, 12], profile);

    expect([...fitting]).toEqual([9, 12]);
  });
});
