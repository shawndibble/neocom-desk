import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FittingStats, PilotProfile } from '@/engine/fittings/types';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillGains } from './useSkillGains';

// Real macrotask yields by default; a test swaps in a gate it opens by hand.
const yieldToEventLoop = vi.fn(() => Promise.resolve());
vi.mock('./yieldToEventLoop', () => ({
  yieldToEventLoop: () => yieldToEventLoop(),
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
  droneDps: 0,
  droneBandwidthUsed: 0,
  droneBandwidthTotal: 0,
  maxActiveDrones: 0,
  droneBandwidthByType: {},
  hardpoints: { turrets: 0, launchers: 0 },
  droneCapacity: 0,
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
  offense: { weapons: [], dps: 100, volley: 500, overheated: null, chargelessWeaponCount: 0 },
  repair: { shield: 0, armor: 0, hull: 0 },
  overheated: null,
  ...neutralExtendedStats(),
};

// 10 is maxed, 20 changes nothing, 30 and 40 help.
const profile: PilotProfile = {
  skillLevels: new Map([
    [10, 5],
    [20, 2],
    [30, 3],
  ]),
  implantTypeIds: [],
  boosterTypeIds: [],
};

function evaluator(sources: number[] = [10, 20, 30, 40]): SkillGainEvaluator {
  return {
    profile,
    skillSources: vi.fn(async () => sources),
    compare: vi.fn(async (skillTypeId: number) => ({
      before: baseStats,
      after:
        skillTypeId === 30
          ? { ...baseStats, ehp: 21000 }
          : skillTypeId === 40
            ? { ...baseStats, offense: { ...baseStats.offense, dps: 120 } }
            : baseStats,
    })),
  };
}

describe('useSkillGains', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yieldToEventLoop.mockImplementation(() => Promise.resolve());
  });

  it('lists only unmaxed skills whose next level changes the fit, each at its next level', async () => {
    const skills = evaluator();
    const { result } = renderHook(() => useSkillGains(skills));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gains?.map((gain) => [gain.skillTypeId, gain.toLevel])).toEqual([
      [30, 4],
      [40, 1],
    ]);
    expect(skills.compare).not.toHaveBeenCalledWith(10, expect.anything());
    expect(skills.compare).toHaveBeenCalledWith(20, 3);
  });

  it('is idle with no evaluator', () => {
    const { result } = renderHook(() => useSkillGains(null));
    expect(result.current).toEqual({ gains: null, loading: false, failed: false });
  });

  it('hands the main thread back between calculations', async () => {
    const skills = evaluator();
    renderHook(() => useSkillGains(skills));
    await waitFor(() => expect(skills.compare).toHaveBeenCalledTimes(3));
    expect(yieldToEventLoop.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('drops a run whose evaluator changed mid-way, never showing its rows', async () => {
    const gates: (() => void)[] = [];
    yieldToEventLoop.mockImplementation(() => new Promise<void>((resolve) => gates.push(resolve)));
    const first = evaluator();
    const second = evaluator([40]);
    const { result, rerender } = renderHook(({ skills }) => useSkillGains(skills), {
      initialProps: { skills: first },
    });
    await waitFor(() => expect(gates.length).toBe(1));
    rerender({ skills: second });
    yieldToEventLoop.mockImplementation(() => Promise.resolve());
    await act(async () => {
      gates.forEach((open) => open());
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(first.compare).not.toHaveBeenCalled();
    expect(result.current.gains?.map((gain) => gain.skillTypeId)).toEqual([40]);
  });

  it('settles as failed, not loading forever, when the sources pass throws', async () => {
    const skills = evaluator();
    skills.skillSources = vi.fn(async () => {
      throw new Error('engine');
    });
    const { result } = renderHook(() => useSkillGains(skills));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.loading).toBe(false);
  });
});
