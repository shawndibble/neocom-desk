import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import { fakeDogmaEngine } from './__fixtures__/fakeDogmaEngine';
import type { VariantEvaluator } from './useFittingEvaluation';
import { ADD_PREVIEW_DELAY_MS, useModuleAddPreview } from './useModuleAddPreview';

const fitting: Fitting = { name: 'Rifter', shipTypeId: 587, modules: [], drones: [], cargo: [] };
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

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

function statsWith(overrides: Partial<FittingStats>): FittingStats {
  return {
    cpuUsed: 100,
    cpuTotal: 400,
    powergridUsed: 500,
    powergridTotal: 1000,
    calibrationUsed: 100,
    calibrationTotal: 400,
    droneDps: 50,
    droneBandwidthUsed: 25,
    droneBandwidthTotal: 50,
    maxActiveDrones: 0,
    droneBandwidthByType: {},
    hardpoints: { turrets: 0, launchers: 0 },
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
    offense: {
      weapons: [],
      dps: 0,
      sustainedDps: 0,
      volley: 0,
      overheated: null,
      chargelessWeaponCount: 0,
    },
    repair: { shield: 0, armor: 0, hull: 0 },
    overheated: null,
    ...neutralExtendedStats(),
    ...overrides,
  } as FittingStats;
}

const before = statsWith({});

function evaluator(after: FittingStats) {
  const compare = vi.fn(async () => ({ before, after }));
  const variants: VariantEvaluator = {
    fitting,
    profile,
    engine: fakeDogmaEngine({}),
    compare,
  };
  return { variants, compare };
}

const build = (f: Fitting, typeId: number): Fitting => ({
  ...f,
  modules: [{ slot: 'low', slotIndex: 0, typeId, state: 'active' }],
});
const noCheck = () => null;

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ADD_PREVIEW_DELAY_MS);
  });
}

describe('useModuleAddPreview', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('diffs the candidate against the Fitting after the debounce', async () => {
    const { variants, compare } = evaluator(statsWith({ ehp: 24000 }));
    const { result } = renderHook(() =>
      useModuleAddPreview({ variants, typeId: 7, build, checkFor: noCheck })
    );

    expect(result.current).toBeNull();
    expect(compare).not.toHaveBeenCalled();
    await settle();

    expect(compare).toHaveBeenCalledWith(build(fitting, 7));
    expect(result.current?.typeId).toBe(7);
    expect(result.current?.delta.changes).toEqual([{ key: 'ehp', before: 20000, after: 24000 }]);
    expect(result.current).toMatchObject({ fits: true, overage: null, canFly: true });
  });

  it('a sweep across rows evaluates only the one the pointer settles on', async () => {
    const { variants, compare } = evaluator(statsWith({}));
    const { rerender } = renderHook(
      ({ typeId }) => useModuleAddPreview({ variants, typeId, build, checkFor: noCheck }),
      { initialProps: { typeId: 1 as number | null } }
    );
    for (const typeId of [2, 3, 4]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ADD_PREVIEW_DELAY_MS - 10);
      });
      rerender({ typeId });
    }
    await settle();

    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith(build(fitting, 4));
  });

  it('cancels on pointer leave, and shows nothing for the row left', async () => {
    const { variants, compare } = evaluator(statsWith({ ehp: 24000 }));
    const { result, rerender } = renderHook(
      ({ typeId }) => useModuleAddPreview({ variants, typeId, build, checkFor: noCheck }),
      { initialProps: { typeId: 1 as number | null } }
    );
    await settle();
    expect(result.current?.typeId).toBe(1);

    rerender({ typeId: null });
    expect(result.current).toBeNull();
    await settle();
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('drops a result that lands after the pointer moved on', async () => {
    let release: (stats: FittingStats) => void = () => {};
    const variants: VariantEvaluator = {
      fitting,
      profile,
      engine: fakeDogmaEngine({}),
      compare: vi.fn(
        () =>
          new Promise<{ before: FittingStats; after: FittingStats }>((resolve) => {
            release = (after) => resolve({ before, after });
          })
      ),
    };
    const { result, rerender } = renderHook(
      ({ typeId }) => useModuleAddPreview({ variants, typeId, build, checkFor: noCheck }),
      { initialProps: { typeId: 1 as number | null } }
    );
    await settle();
    rerender({ typeId: null });
    await act(async () => release(statsWith({ ehp: 99999 })));

    expect(result.current).toBeNull();
  });

  it('reports over-budget and can’t-fly', async () => {
    const { variants } = evaluator(statsWith({ cpuUsed: 450 }));
    const { result } = renderHook(() =>
      useModuleAddPreview({
        variants,
        typeId: 7,
        build,
        checkFor: () => ({ fitsHull: true, fitsResources: true, canFly: false }),
      })
    );
    await settle();

    expect(result.current?.fits).toBe(false);
    expect(result.current?.overage).toEqual({ resource: 'cpu', amount: 50 });
    expect(result.current?.canFly).toBe(false);
  });

  it('shows nothing when a click would add nothing', async () => {
    const { variants, compare } = evaluator(statsWith({}));
    const { result } = renderHook(() =>
      useModuleAddPreview({ variants, typeId: 7, build: () => null, checkFor: noCheck })
    );
    await settle();

    expect(compare).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
