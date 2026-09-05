import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import '@/i18n';
import {
  useComparedBuildResults,
  type UseComparedBuildResultsArgs,
} from './useComparedBuildResults';
import { computeBuildPlan } from './computeBuildPlan';
import { loadMarketSnapshot } from './marketData';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { BuildResult } from '@/engine/industry/types';

vi.mock('./computeBuildPlan', () => ({ computeBuildPlan: vi.fn() }));
vi.mock('./marketData', () => ({ loadMarketSnapshot: vi.fn() }));

const mockedCompute = vi.mocked(computeBuildPlan);
const mockedSnapshot = vi.mocked(loadMarketSnapshot);

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

const baseArgs: Omit<UseComparedBuildResultsArgs, 'plans' | 'catalog'> = {
  pi: null,
  skills: {},
};

beforeEach(() => {
  mockedCompute.mockReset();
  mockedSnapshot.mockReset();
  mockedSnapshot.mockResolvedValue({
    hubPrices: {},
    hubBuyPrices: {},
    adjustedPrices: {},
    systemCostIndex: 0.01,
  });
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
        error: null,
      },
      {
        planId: 'b',
        planName: 'Plan B',
        productName: 'Widget',
        runs: 10,
        loading: false,
        result: RESULT,
        error: null,
      },
    ]);
    expect(mockedSnapshot).toHaveBeenCalledTimes(2);
  });

  it('reports a plan whose blueprint is missing from the catalog as unresolved, without dropping it', async () => {
    const catalog = catalogWith([]); // blueprintTypeID 100 not in the catalog
    const plans = [plan({ id: 'a', name: 'Orphan plan' })];

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));

    await waitFor(() => expect(result.current[0]?.loading).toBe(false));

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.result).toBeNull();
    expect(result.current[0]?.error).toBeTruthy();
    expect(mockedSnapshot).not.toHaveBeenCalled();
  });

  it("reports one plan's market-snapshot failure without affecting the other plan's row", async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100 }), entry({ blueprintTypeID: 200 })]);
    const plans = [
      plan({ id: 'a', name: 'Failing plan', blueprintTypeID: 100 }),
      plan({ id: 'b', name: 'Fine plan', blueprintTypeID: 200 }),
    ];

    mockedSnapshot.mockImplementation(async () => {
      throw new Error('ESI unreachable');
    });
    // Second call (for the "fine" plan) succeeds instead.
    mockedSnapshot.mockRejectedValueOnce(new Error('ESI unreachable')).mockResolvedValueOnce({
      hubPrices: {},
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0.01,
    });

    const { result } = renderHook(() => useComparedBuildResults({ plans, catalog, ...baseArgs }));

    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));

    const failing = result.current.find((row) => row.planId === 'a');
    const fine = result.current.find((row) => row.planId === 'b');
    expect(failing?.result).toBeNull();
    expect(failing?.error).toBe('ESI unreachable');
    expect(fine?.result).toEqual(RESULT);
    expect(fine?.error).toBeNull();
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
});
