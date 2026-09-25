import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { useModuleVariations } from './useModuleVariations';

const checkCandidates = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  checkCandidates: (...args: unknown[]) => checkCandidates(...args),
}));

const getHubPrices = vi.fn();
vi.mock('@/market/prices', () => ({
  getHubPrices: (...args: unknown[]) => getHubPrices(...args),
}));

function layer(hp: number) {
  return {
    hp,
    ehp: hp * 1.5,
    emResonance: 0.8,
    thermalResonance: 0.7,
    kineticResonance: 0.6,
    explosiveResonance: 0.5,
  };
}

const baseStats: FittingStats = {
  cpuUsed: 100,
  cpuTotal: 400,
  powergridUsed: 500,
  powergridTotal: 1000,
  calibrationUsed: 100,
  calibrationTotal: 400,
  droneDps: 50,
  droneBandwidthUsed: 25,
  droneBandwidthTotal: 50,
  droneCapacity: 75,
  ehp: 20000,
  capacitor: { stable: true, stablePercentage: 62 },
  capacitorCapacity: 1500,
  capacitorRechargeTime: 300000,
  shield: layer(5000),
  armor: layer(4000),
  hull: layer(3000),
  targeting: {
    maxTargetRange: 60000,
    maxLockedTargets: 6,
    scanResolution: 400,
    signatureRadius: 120,
  },
  navigation: { maxVelocity: 250, agility: 3.5, mass: 10000000, warpSpeed: 3 },
  unknownItemTypeIds: [],
  applied: { weapons: [], droneControlRange: 20000 },
  slotCounts: { high: 4, medium: 4, low: 4, rig: 3, subsystem: 0 },
  modules: [],
  offense: { weapons: [], dps: 0, volley: 0, overheated: null },
  repair: { shield: 0, armor: 0, hull: 0 },
  overheated: null,
};

const fitting: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active' }],
  drones: [],
  cargo: [],
};

const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

/** A variant's stats by the type swapped into slot 0; `compare` pairs them with `baseStats`. */
function evaluator(afterFor: (typeId: number | undefined) => FittingStats): VariantEvaluator {
  return {
    fitting,
    profile,
    compare: vi.fn(async (variant: Fitting) => ({
      before: baseStats,
      after: afterFor(variant.modules[0]?.typeId),
    })),
  };
}

const catalogue: FittingCatalogue = {
  types: {
    100: { name: 'Root Gun I', groupID: 1 },
    101: { name: 'Root Gun II', groupID: 1 },
    102: { name: 'Root Gun (other rack)', groupID: 1 },
  } as unknown as FittingCatalogue['types'],
  rackOf: { '100': 'high', '101': 'high', '102': 'medium' },
  marketTypes: [],
  groupsById: new Map(),
  childrenByParent: new Map(),
  parentOf: new Map(),
  typeIdsByGroup: new Map(),
  variations: {
    types: {
      100: { parentTypeId: null, metaGroupId: 1 },
      101: { parentTypeId: 100, metaGroupId: 2 },
      102: { parentTypeId: 100, metaGroupId: 2 },
    },
    metaGroups: { 1: 'Tech I', 2: 'Tech II' },
  },
};

describe('useModuleVariations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists same-rack siblings only, excluding the currently fitted type, with delta/fits/canFly/price', async () => {
    const variants = evaluator(() => ({ ...baseStats, ehp: 24000 }));
    checkCandidates.mockReturnValue(new Map([[101, { fitsHull: true, canFly: true }]]));
    getHubPrices.mockResolvedValue(new Map([[101, { sellMin: 5_000_000 }]]));

    const { result } = renderHook(() =>
      useModuleVariations({ variants, slot: 'high', slotIndex: 0, typeId: 100, catalogue })
    );

    expect(result.current.rows.map((row) => row.typeId)).toEqual([101]);

    await waitFor(() => expect(result.current.rows[0].delta).not.toBeNull());
    expect(result.current.rows[0].delta).toEqual({
      changes: [{ key: 'ehp', before: 20000, after: 24000 }],
      count: 1,
    });
    expect(result.current.rows[0].fits).toBe(true);
    expect(result.current.rows[0].canFly).toBe(true);
    expect(result.current.rows[0].price).toBe(5_000_000);
    expect(result.current.loading).toBe(false);
  });

  it('returns no rows for a type with no siblings, without calling the engine', () => {
    const variants = evaluator(() => baseStats);
    const { result } = renderHook(() =>
      useModuleVariations({ variants, slot: 'high', slotIndex: 0, typeId: 999, catalogue })
    );

    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(variants.compare).not.toHaveBeenCalled();
  });

  it("drops the previous evaluator's rows until the new one's land", async () => {
    checkCandidates.mockReturnValue(new Map([[101, { fitsHull: true, canFly: true }]]));
    getHubPrices.mockResolvedValue(new Map());

    const { result, rerender } = renderHook(
      (variants: VariantEvaluator) =>
        useModuleVariations({ variants, slot: 'high', slotIndex: 0, typeId: 100, catalogue }),
      { initialProps: evaluator(() => ({ ...baseStats, ehp: 24000 })) }
    );
    await waitFor(() => expect(result.current.rows[0].delta).not.toBeNull());

    // A Character switch (a new evaluator, same Fitting/slot) must not keep
    // showing the previous Character's results while its own are in flight.
    rerender(evaluator(() => ({ ...baseStats, ehp: 26000 })));
    expect(result.current.rows[0].delta).toBeNull();
    await waitFor(() =>
      expect(result.current.rows[0].delta?.changes[0]).toMatchObject({ after: 26000 })
    );
  });

  it('keeps the other rows when one variant candidate fails to calculate', async () => {
    const variants = evaluator((swappedTo) => {
      if (swappedTo === 101) throw new Error('engine calculate() failed for this candidate');
      return { ...baseStats, ehp: 25000 };
    });
    checkCandidates.mockReturnValue(
      new Map([
        [101, { fitsHull: true, canFly: true }],
        [102, { fitsHull: true, canFly: true }],
      ])
    );
    getHubPrices.mockResolvedValue(new Map());

    const wideCatalogue: FittingCatalogue = {
      ...catalogue,
      rackOf: { ...catalogue.rackOf, '102': 'high' },
      variations: {
        ...catalogue.variations,
        types: { ...catalogue.variations.types, 102: { parentTypeId: 100, metaGroupId: 2 } },
      },
    };

    const { result } = renderHook(() =>
      useModuleVariations({
        variants,
        slot: 'high',
        slotIndex: 0,
        typeId: 100,
        catalogue: wideCatalogue,
      })
    );

    await waitFor(() =>
      expect(result.current.rows.find((row) => row.typeId === 102)?.delta).not.toBeNull()
    );
    expect(result.current.rows.find((row) => row.typeId === 101)?.delta).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
