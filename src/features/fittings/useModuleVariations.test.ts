import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import type { FittingCatalogue } from './useFittingCatalogue';
import { useModuleVariations } from './useModuleVariations';

const computeFittingStats = vi.fn();
const checkCandidates = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  computeFittingStats: (...args: unknown[]) => computeFittingStats(...args),
  checkCandidates: (...args: unknown[]) => checkCandidates(...args),
}));

const getHubPrices = vi.fn();
vi.mock('@/market/prices', () => ({
  getHubPrices: (...args: unknown[]) => getHubPrices(...args),
}));

function layer(hp: number) {
  return {
    hp,
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
  slotCounts: { high: 4, medium: 4, low: 4, rig: 3, subsystem: 0 },
  modules: [],
};

const fitting: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active' }],
  drones: [],
  cargo: [],
};

const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

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

  /** Baseline call is the unswapped Fitting (module typeId 100); any other call is a swap candidate. */
  function mockEngineFor(swappedEhp: number) {
    computeFittingStats.mockImplementation(async (f: Fitting) =>
      f.modules[0]?.typeId === 100 ? baseStats : { ...baseStats, ehp: swappedEhp }
    );
  }

  it('lists same-rack siblings only, excluding the currently fitted type, with delta/fits/canFly/price', async () => {
    mockEngineFor(24000);
    checkCandidates.mockReturnValue(new Map([[101, { fitsHull: true, canFly: true }]]));
    getHubPrices.mockResolvedValue(new Map([[101, { sellMin: 5_000_000 }]]));

    const { result } = renderHook(() =>
      useModuleVariations({
        fitting,
        slot: 'high',
        slotIndex: 0,
        typeId: 100,
        catalogue,
        engineReady: true,
        profile,
      })
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
    const { result } = renderHook(() =>
      useModuleVariations({
        fitting,
        slot: 'high',
        slotIndex: 0,
        typeId: 999,
        catalogue,
        engineReady: true,
        profile,
      })
    );

    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(computeFittingStats).not.toHaveBeenCalled();
  });

  it('recomputes its own baseline against the current profile, not a stale caller-supplied one', async () => {
    mockEngineFor(24000);
    checkCandidates.mockReturnValue(new Map([[101, { fitsHull: true, canFly: true }]]));
    getHubPrices.mockResolvedValue(new Map());

    const otherProfile: PilotProfile = {
      skillLevels: new Map([[1, 5]]),
      implantTypeIds: [],
      boosterTypeIds: [],
    };
    const { result, rerender } = renderHook(
      (p: PilotProfile) =>
        useModuleVariations({
          fitting,
          slot: 'high',
          slotIndex: 0,
          typeId: 100,
          catalogue,
          engineReady: true,
          profile: p,
        }),
      { initialProps: profile }
    );
    await waitFor(() => expect(result.current.rows[0].delta).not.toBeNull());

    // A Character switch (new profile object, same Fitting/slot) must not
    // keep showing the previous Character's fresh results while the new
    // profile's own computation is still in flight.
    rerender(otherProfile);
    expect(result.current.rows[0].delta).toBeNull();
    await waitFor(() => expect(result.current.rows[0].delta).not.toBeNull());
  });

  it('keeps the other rows when one variant candidate fails to calculate', async () => {
    computeFittingStats.mockImplementation(async (f: Fitting) => {
      const swappedTo = f.modules[0]?.typeId;
      if (swappedTo === 100) return baseStats;
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
        fitting,
        slot: 'high',
        slotIndex: 0,
        typeId: 100,
        catalogue: wideCatalogue,
        engineReady: true,
        profile,
      })
    );

    await waitFor(() =>
      expect(result.current.rows.find((row) => row.typeId === 102)?.delta).not.toBeNull()
    );
    expect(result.current.rows.find((row) => row.typeId === 101)?.delta).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
