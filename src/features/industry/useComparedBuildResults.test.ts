import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { renderHook, waitFor, act } from '@testing-library/react';
import '@/i18n';
import {
  useComparedBuildResults,
  type UseComparedBuildResultsArgs,
} from './useComparedBuildResults';
import { computeBuildPlan } from './computeBuildPlan';
import { loadMarketSnapshots, type MarketSnapshot } from './marketData';
import { useAssumedMe } from './assumedMe';
import { useIncludeBlueprintCost } from './includeBlueprintCost';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { BuildResult } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';

vi.mock('./computeBuildPlan', () => ({ computeBuildPlan: vi.fn() }));
vi.mock('./marketData', () => ({ loadMarketSnapshots: vi.fn() }));
vi.mock('@/features/bpcContracts/syncedContracts', () => ({
  loadPublicBpcContracts: vi.fn(),
}));
// A controllable stand-in for the real synced-setting store, so the
// hydration-gating test below can flip `hydrated` deterministically instead
// of racing the real Dexie/fake-indexeddb read.
vi.mock('./assumedMe', () => ({
  useAssumedMe: create(() => ({ value: 0, hydrated: false, hydrate: vi.fn() })),
}));
vi.mock('./includeBlueprintCost', () => ({
  useIncludeBlueprintCost: create(() => ({ value: true, hydrated: true, hydrate: vi.fn() })),
}));

const mockedCompute = vi.mocked(computeBuildPlan);
const mockedSnapshots = vi.mocked(loadMarketSnapshots);
const mockedAssumedMe = vi.mocked(useAssumedMe);
const mockedIncludeBlueprintCost = vi.mocked(useIncludeBlueprintCost);
const mockedBpcContracts = vi.mocked(loadPublicBpcContracts);

function plan(overrides: Partial<BuildPlanRecord> & { id: string }): BuildPlanRecord {
  return {
    characterId: 1,
    name: 'Plan',
    blueprintTypeID: 100,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

function entry(
  overrides: Partial<BlueprintCatalogEntry> & { blueprintTypeID: number }
): BlueprintCatalogEntry {
  return {
    blueprint: {
      name: 'Blueprint',
      time: 100,
      materials: [],
      products: [{ typeID: 1, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
    productTypeID: 1,
    productName: 'Widget',
    productNameLower: 'widget',
    ...overrides,
  };
}

function catalogWith(entries: BlueprintCatalogEntry[]): BlueprintCatalog {
  return {
    entries,
    byBlueprintTypeID: new Map(entries.map((e) => [e.blueprintTypeID, e])),
    byProductTypeID: new Map(),
    typesById: {},
  };
}

const RESULT: BuildResult = {
  materials: [],
  seconds: 3600,
  jobFee: { eiv: 1000, grossCost: 50, sccSurcharge: 10, facilityTax: 5, total: 65 },
  materialCost: 500,
  totalCost: 565,
  buyCost: 1000,
  revenue: 1000,
  salesTax: 10,
  brokerFee: 5,
  netRevenue: 985,
  profit: 435,
  marginPct: 77,
  iskPerHour: 435,
  grossProfit: 460,
  grossMargin: 82,
  grossIskPerHour: 460,
  breakEvenPrice: 92.5,
  unpricedMaterials: [],
  unpriceable: false,
  recommendation: 'build',
};

const SNAPSHOT: MarketSnapshot = {
  hubPrices: {},
  hubBuyPrices: {},
  hubSellVolumes: {},
  adjustedPrices: {},
  systemCostIndex: 0.01,
};

const baseArgs: Omit<UseComparedBuildResultsArgs, 'plans' | 'catalog'> = {
  pi: null,
  ownedBlueprints: [],
  skills: {},
};

beforeEach(() => {
  mockedCompute.mockReset();
  mockedSnapshots.mockReset();
  // Hydrated by default so the existing tests below (which don't care about
  // this setting) exercise the real fetch path; the hydration-gating test
  // overrides this to `false` itself.
  mockedAssumedMe.setState({ value: 0, hydrated: true, hydrate: vi.fn() });
  mockedIncludeBlueprintCost.setState({ value: true, hydrated: true, hydrate: vi.fn() });
  mockedBpcContracts.mockReset();
  mockedBpcContracts.mockResolvedValue(null);
  mockedSnapshots.mockImplementation((requests) => requests.map(() => Promise.resolve(SNAPSHOT)));
  mockedCompute.mockReturnValue({ result: RESULT, error: null });
});

describe('useComparedBuildResults', () => {
  it('returns nothing for an empty plan list', () => {
    // Catalog is hoisted out of the render callback: a fresh object identity
    // on every render would keep retriggering the fetch effect below (it
    // depends on `catalog` by reference, same as `BuildPlanDetail.tsx`'s
    // snapshot effect assumes a stable catalog reference from its caller) —
    // setting `rows` to a new `[]` triggers a re-render that would otherwise
    // recreate the catalog forever.
    const catalog = catalogWith([]);
    const { result } = renderHook(() =>
      useComparedBuildResults({ plans: [], catalog, ...baseArgs })
    );
    expect(result.current).toEqual([]);
  });

  it('returns nothing while the catalog has not loaded yet', () => {
    const { result } = renderHook(() =>
      useComparedBuildResults({ plans: [plan({ id: 'a' })], catalog: null, ...baseArgs })
    );
    expect(result.current).toEqual([]);
  });

  it('computes each plan independently and reports a resolved row per plan', async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100, productName: 'Widget' })]);
    const plans = [
      plan({ id: 'a', name: 'Plan A', runs: 5 }),
      plan({ id: 'b', name: 'Plan B', runs: 10 }),
    ];

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));

    // Synchronous placeholder rows before any fetch settles.
    expect(result.current).toHaveLength(2);
    expect(result.current.every((row) => row.loading)).toBe(true);

    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));

    expect(result.current).toEqual([
      {
        planId: 'a',
        planName: 'Plan A',
        productName: 'Widget',
        runs: 5,
        loading: false,
        result: RESULT,
        groupResult: null,
        error: null,
      },
      {
        planId: 'b',
        planName: 'Plan B',
        productName: 'Widget',
        runs: 10,
        loading: false,
        result: RESULT,
        groupResult: null,
        error: null,
      },
    ]);
    // Both plans sit at the same hub, so one batched request set prices
    // them both — not one snapshot load per plan (issue #628).
    expect(mockedSnapshots).toHaveBeenCalledTimes(1);
    const requests = mockedSnapshots.mock.calls[0]?.[0] ?? [];
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.hub.id === 'jita')).toBe(true);
  });

  it('reports a plan whose blueprint is missing from the catalog as unresolved, without dropping it', async () => {
    const catalog = catalogWith([]); // blueprintTypeID 100 not in the catalog
    const plans = [plan({ id: 'a', name: 'Orphan plan' })];

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));

    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.result).toBeNull();
    expect(result.current[0]?.error).toBeTruthy();
    expect(mockedSnapshots).toHaveBeenCalledWith([]);
  });

  it("reports one plan's market-snapshot failure without affecting the other plan's row", async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100 }), entry({ blueprintTypeID: 200 })]);
    // Two hubs, so each plan is priced by its own fetch: batching unions
    // per hub, and one hub going down must not take the other hub's plan
    // down with it (issue #453).
    const plans = [
      plan({ id: 'a', name: 'Failing plan', blueprintTypeID: 100, hubId: 'jita' }),
      plan({ id: 'b', name: 'Fine plan', blueprintTypeID: 200, hubId: 'amarr' }),
    ];

    mockedSnapshots.mockImplementation((requests) =>
      requests.map((request) =>
        request.hub.id === 'jita'
          ? Promise.reject(new Error('ESI unreachable'))
          : Promise.resolve(SNAPSHOT)
      )
    );

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));

    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));

    const failing = result.current.find((row) => row.planId === 'a');
    const fine = result.current.find((row) => row.planId === 'b');
    expect(failing?.result).toBeNull();
    expect(failing?.error).toBe('ESI unreachable');
    expect(fine?.result).toEqual(RESULT);
    expect(fine?.error).toBeNull();
  });

  it('reports the failure on every plan sharing the failed hub, dropping none of them', async () => {
    // The shape batching actually created: same-hub plans await one shared
    // fetch, so they fail together. Each still gets its own row with its own
    // error rather than vanishing from the comparison (issue #453).
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [
      plan({ id: 'a', name: 'Plan A', hubId: 'jita' }),
      plan({ id: 'b', name: 'Plan B', hubId: 'jita' }),
    ];

    mockedSnapshots.mockImplementation((requests) => {
      const failed = Promise.reject(new Error('ESI unreachable'));
      return requests.map(() => failed);
    });

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));

    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));

    expect(result.current).toHaveLength(2);
    expect(result.current.map((row) => row.planId)).toEqual(['a', 'b']);
    expect(result.current.every((row) => row.error === 'ESI unreachable')).toBe(true);
    expect(result.current.every((row) => row.result === null)).toBe(true);
  });

  it('recomputes when the plan list changes', async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const { result, rerender } = renderHook(
      (props: UseComparedBuildResultsArgs) => useComparedBuildResults(props),
      { initialProps: { plans: [plan({ id: 'a' })], catalog, ...baseArgs } }
    );

    await waitFor(() => expect(result.current[0]?.loading).toBe(false));
    expect(result.current).toHaveLength(1);

    rerender({ plans: [plan({ id: 'a' }), plan({ id: 'b' })], catalog, ...baseArgs });

    await waitFor(() => expect(result.current).toHaveLength(2));
    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));
  });

  it(
    'recomputes an existing member when its own buildHere/updatedAt changes, same list length — ' +
      "the mechanism a Build Group's rollup (issue #696) depends on for a manual craft/buy edit, " +
      'or a group Auto Build, to show up in the group total on next open',
    async () => {
      const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
      const { rerender } = renderHook(
        (props: UseComparedBuildResultsArgs) => useComparedBuildResults(props),
        { initialProps: { plans: [plan({ id: 'a', updatedAt: 1 })], catalog, ...baseArgs } }
      );

      await waitFor(() => expect(mockedCompute).toHaveBeenCalledTimes(1));

      rerender({
        plans: [plan({ id: 'a', updatedAt: 2, buildHere: [999] })],
        catalog,
        ...baseArgs,
      });

      await waitFor(() => expect(mockedCompute).toHaveBeenCalledTimes(2));
      expect(mockedCompute.mock.calls[1]?.[0]?.plan.buildHere).toEqual([999]);
    }
  );

  it("prices each row at its own plan's material price basis", async () => {
    // Compare has to agree with the plan's own detail panel: a buy-basis plan
    // shown beside a sell-basis one must not quietly quote both at sell.
    mockedSnapshots.mockImplementation((requests) =>
      requests.map(() =>
        Promise.resolve({
          hubPrices: { 34: 5 },
          hubBuyPrices: { 34: 4 },
          hubSellVolumes: {},
          adjustedPrices: {},
          systemCostIndex: 0.01,
        })
      )
    );
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    // Distinct run counts, because `computeBuildPlan` is handed a Pick of the
    // record that carries no id — runs is what tells the two calls apart.
    const plans = [
      plan({ id: 'sell', name: 'Sell basis', runs: 5 }),
      plan({ id: 'buy', name: 'Buy basis', runs: 9, materialPriceBasis: 'buy' }),
    ];

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));
    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));

    const byRuns = new Map(
      mockedCompute.mock.calls.map(([args]) => [args.plan.runs, args.materialPrices])
    );
    expect(byRuns.get(5)).toEqual({ 34: 5 });
    expect(byRuns.get(9)).toEqual({ 34: 4 });
  });

  it('wires a recipeFor into computeBuildPlan, matching what BuildPlanDetail.tsx passes, so a buildHere material rolls up instead of pricing at the hub', async () => {
    const producedEntry = entry({
      blueprintTypeID: 200,
      productTypeID: 300,
      productName: 'Component',
    });
    const catalog: BlueprintCatalog = {
      ...catalogWith([entry({ blueprintTypeID: 100 }), producedEntry]),
      byProductTypeID: new Map([[300, producedEntry]]),
    };
    const ownedBlueprints: CharacterBlueprint[] = [
      {
        item_id: 1,
        type_id: 200,
        runs: -1,
        material_efficiency: 7,
        time_efficiency: 14,
        quantity: 1,
        location_id: 60003760,
        location_flag: 'Hangar',
      },
    ];
    const plans = [plan({ id: 'a', buildHere: [300] })];

    const { result } = renderHook(() =>
      useComparedBuildResults({ ...baseArgs, plans, catalog, ownedBlueprints })
    );
    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    const call = mockedCompute.mock.calls[0]?.[0];
    expect(typeof call?.recipeFor).toBe('function');
    expect(call?.recipeFor?.(300)).toEqual(
      expect.objectContaining({ method: 'manufacturing', me: 7 })
    );
  });

  it('wires blueprintAcquisition and acquisitionFor into computeBuildPlan when a tier resolves (issue: index profit column excluded blueprint cost)', async () => {
    const producedEntry = entry({ blueprintTypeID: 100, productTypeID: 1, productName: 'Widget' });
    const catalog: BlueprintCatalog = {
      ...catalogWith([producedEntry]),
      byProductTypeID: new Map([[1, producedEntry]]),
    };
    mockedSnapshots.mockImplementation((requests) =>
      requests.map(() =>
        // hubPrices[100] is the blueprint's own typeID — the BPO's ordinary
        // sell price, the fallback tier when nothing is owned and BPC
        // Sourcing has no listing.
        Promise.resolve({
          hubPrices: { 100: 500 },
          hubBuyPrices: {},
          hubSellVolumes: {},
          adjustedPrices: {},
          systemCostIndex: 0.01,
        })
      )
    );
    const plans = [plan({ id: 'a' })];

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));
    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    const call = mockedCompute.mock.calls[0]?.[0];
    expect(call?.blueprintAcquisition).toEqual({
      blueprintTypeID: 100,
      line: { unitPrice: 500, owned: false },
    });
    expect(typeof call?.acquisitionFor).toBe('function');
  });

  it('reports no blueprint cost, while still resolving the tier, when the includeBlueprintCost setting is off', async () => {
    mockedIncludeBlueprintCost.setState({ value: false, hydrated: true, hydrate: vi.fn() });
    const producedEntry = entry({ blueprintTypeID: 100, productTypeID: 1, productName: 'Widget' });
    const catalog: BlueprintCatalog = {
      ...catalogWith([producedEntry]),
      byProductTypeID: new Map([[1, producedEntry]]),
    };
    mockedSnapshots.mockImplementation((requests) =>
      requests.map(() =>
        Promise.resolve({
          hubPrices: { 100: 500 },
          hubBuyPrices: {},
          hubSellVolumes: {},
          adjustedPrices: {},
          systemCostIndex: 0.01,
        })
      )
    );
    const plans = [plan({ id: 'a' })];

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));
    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    const call = mockedCompute.mock.calls[0]?.[0];
    expect(call?.blueprintAcquisition).toEqual({ blueprintTypeID: 100, line: null });
  });

  it('leaves groupResult null and never calls computeBuildPlan a second time when computeGroupResult is not requested', async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [plan({ id: 'a' })];

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));
    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    expect(result.current[0]?.groupResult).toBeNull();
    expect(mockedCompute).toHaveBeenCalledTimes(1);
  });

  it('computes a second, owned-stock-disabled result per plan when computeGroupResult is set (issue #697)', async () => {
    const GROUP_RESULT: BuildResult = { ...RESULT, materialCost: 900, totalCost: 965 };
    mockedCompute.mockImplementation(({ ignoreOwnedStock }) => ({
      result: ignoreOwnedStock ? GROUP_RESULT : RESULT,
      error: null,
    }));
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [plan({ id: 'a' })];

    const { result } = renderHook(() =>
      useComparedBuildResults({ plans, catalog, ...baseArgs, computeGroupResult: true })
    );
    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    expect(result.current[0]?.result).toEqual(RESULT);
    expect(result.current[0]?.groupResult).toEqual(GROUP_RESULT);
    expect(mockedCompute).toHaveBeenCalledTimes(2);
    expect(mockedCompute.mock.calls.some(([args]) => args.ignoreOwnedStock === true)).toBe(true);
  });

  it("surfaces the group computation's own error on the row when the primary computation succeeds but the group one fails (issue #697)", async () => {
    mockedCompute.mockImplementation(({ ignoreOwnedStock }) =>
      ignoreOwnedStock
        ? { result: null, error: 'group compute failed' }
        : { result: RESULT, error: null }
    );
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [plan({ id: 'a' })];

    const { result } = renderHook(() =>
      useComparedBuildResults({ plans, catalog, ...baseArgs, computeGroupResult: true })
    );
    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    expect(result.current[0]?.result).toEqual(RESULT);
    expect(result.current[0]?.groupResult).toBeNull();
    expect(result.current[0]?.error).toBe('group compute failed');
  });

  it('waits for the assumedMe setting to hydrate before fetching, instead of fetching once at the default and again once hydrated', async () => {
    mockedAssumedMe.setState({ value: 0, hydrated: false, hydrate: vi.fn() });
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [plan({ id: 'a' })];

    const { result } = renderHook(() => useComparedBuildResults({ ...baseArgs, plans, catalog }));

    // Hydrate must resolve first (see hook comment above).
    expect(result.current.every((row) => row.loading)).toBe(true);
    expect(mockedSnapshots).not.toHaveBeenCalled();

    act(() => {
      mockedAssumedMe.setState({ value: 3, hydrated: true, hydrate: vi.fn() });
    });

    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));
    expect(mockedSnapshots).toHaveBeenCalledTimes(1);
  });
});
