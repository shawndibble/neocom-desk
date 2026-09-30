import { describe, expect, it, vi } from 'vitest';
import type { AttributeWithSources, SourceLike } from './affectedBy';
import {
  evaluateSkillGains,
  gainMetrics,
  rankSkillGains,
  skillGainCandidates,
  skillSourceTypeIds,
  trainingTimeFor,
  type SkillGain,
} from './skillGains';
import type { FittingStats } from './types';
import { neutralExtendedStats } from './__fixtures__/fittingStats';

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
  capacitor: { stable: true, stablePercentage: 50 },
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
  navigation: { maxVelocity: 250, agility: 4, mass: 10_000_000, warpSpeed: 3 },
  unknownItemTypeIds: [],
  applied: { weapons: [], droneControlRange: 20000 },
  slotCounts: { high: 4, medium: 4, low: 4, rig: 3, subsystem: 0 },
  modules: [],
  offense: { weapons: [], dps: 100, volley: 500, overheated: null, chargelessWeaponCount: 0 },
  repair: { shield: 0, armor: 20, hull: 0 },
  overheated: null,
  ...neutralExtendedStats(),
};

function withStats(patch: Partial<FittingStats>): FittingStats {
  return { ...baseStats, ...patch };
}

function source(from: SourceLike['from']): SourceLike {
  return {
    from,
    effect_id: 1,
    source_attribute_id: 2,
    operator: 'post_percent',
    value: 10,
    quantity: 1,
    penalty: undefined,
    applied: true,
  };
}

function attrs(...sources: SourceLike[]): Map<number, AttributeWithSources> {
  return new Map([[37, { base: 1, value: 2, sources }]]);
}

describe('skillSourceTypeIds', () => {
  it('collects every skill that modifies the ship, character, items and their charges', () => {
    const ids = skillSourceTypeIds([
      { attributes: attrs(source({ type: 'skill', type_id: 3413 }), source({ type: 'ship' })) },
      { attributes: attrs(source({ type: 'skill', type_id: 3318 })) },
      {
        attributes: attrs(source({ type: 'item', index: 0 })),
        charge: { attributes: attrs(source({ type: 'skill', type_id: 3319 })) },
      },
      { attributes: attrs(source({ type: 'skill', type_id: 3413 })) },
    ]);
    expect([...ids].sort()).toEqual([3318, 3319, 3413]);
  });

  it('ignores the derived (negative) attributes and attributes without sources', () => {
    const ids = skillSourceTypeIds([
      {
        attributes: new Map<number, AttributeWithSources>([
          [-1, { base: 0, value: 0, sources: [source({ type: 'skill', type_id: 1 })] }],
          [5, { base: 0, value: 0 }],
        ]),
      },
    ]);
    expect(ids.size).toBe(0);
  });
});

describe('skillGainCandidates', () => {
  it('keeps unmaxed skills at their next level, untrained ones included, in id order', () => {
    const levels = new Map([
      [10, 5],
      [20, 3],
    ]);
    expect(skillGainCandidates([30, 20, 10], levels)).toEqual([
      { skillTypeId: 20, fromLevel: 3, toLevel: 4 },
      { skillTypeId: 30, fromLevel: 0, toLevel: 1 },
    ]);
  });
});

describe('gainMetrics', () => {
  it('scores each tracked stat as a relative improvement, align time lower-is-better', () => {
    const after = withStats({
      offense: { ...baseStats.offense, dps: 110 },
      navigation: { ...baseStats.navigation, agility: 3.6 },
    });
    const metrics = gainMetrics(baseStats, after);
    expect(metrics.dps).toBeCloseTo(0.1);
    expect(metrics.align).toBeCloseTo(0.1);
    expect(metrics.ehp).toBe(0);
    expect(metrics.overall).toBeCloseTo(0.2);
  });

  it('scores active tank from all three repairs, and a new rep from zero as a whole gain', () => {
    const noReps = withStats({ repair: { shield: 0, armor: 0, hull: 0 } });
    const metrics = gainMetrics(noReps, baseStats);
    expect(metrics.activeTank).toBe(1);
  });

  it('scores the capacitor turning stable as a whole gain, and stable % in points', () => {
    const unstable = withStats({ capacitor: { stable: false, depletesInSeconds: 120 } });
    expect(gainMetrics(unstable, baseStats).capacitor).toBe(1);
    expect(gainMetrics(baseStats, unstable).capacitor).toBe(-1);
    const higher = withStats({ capacitor: { stable: true, stablePercentage: 60 } });
    expect(gainMetrics(baseStats, higher).capacitor).toBeCloseTo(0.1);
    const longer = withStats({ capacitor: { stable: false, depletesInSeconds: 150 } });
    expect(gainMetrics(unstable, longer).capacitor).toBeCloseTo(0.25);
  });
});

describe('evaluateSkillGains', () => {
  const candidates = [
    { skillTypeId: 1, fromLevel: 3, toLevel: 4 },
    { skillTypeId: 2, fromLevel: 0, toLevel: 1 },
    { skillTypeId: 3, fromLevel: 4, toLevel: 5 },
  ];

  it('keeps only the skills whose next level changes a tracked stat', async () => {
    const compare = vi.fn(async (skillTypeId: number) => ({
      before: baseStats,
      after:
        skillTypeId === 1
          ? withStats({ offense: { ...baseStats.offense, dps: 105 } })
          : skillTypeId === 3
            ? withStats({ ehp: 22000 })
            : // A CPU-only change is displayed but not ranked on.
              withStats({ cpuTotal: 440 }),
    }));
    const gains = await evaluateSkillGains(candidates, compare);
    expect(compare).toHaveBeenCalledWith(1, 4);
    expect(compare).toHaveBeenCalledWith(2, 1);
    expect(gains?.map((gain) => gain.skillTypeId)).toEqual([1, 3]);
    expect(gains?.[0]?.delta.changes.map((change) => change.key)).toContain('totalDps');
    expect(gains?.[1]?.metrics.ehp).toBeCloseTo(0.1);
  });

  it('yields between runs and stops, returning null, once cancelled', async () => {
    let cancelled = false;
    const between = vi.fn(async () => {});
    const compare = vi.fn(async () => {
      cancelled = true;
      return { before: baseStats, after: withStats({ ehp: 30000 }) };
    });
    const gains = await evaluateSkillGains(candidates, compare, {
      between,
      cancelled: () => cancelled,
    });
    expect(gains).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(between).toHaveBeenCalledTimes(2);
  });

  it('leaves out a skill whose calculation throws, keeping the rest', async () => {
    const compare = vi.fn(async (skillTypeId: number) => {
      if (skillTypeId === 1) throw new Error('boom');
      return { before: baseStats, after: withStats({ ehp: 30000 }) };
    });
    const gains = await evaluateSkillGains(candidates, compare);
    expect(gains?.map((gain) => gain.skillTypeId)).toEqual([2, 3]);
  });
});

describe('rankSkillGains', () => {
  function gain(skillTypeId: number, metrics: Partial<SkillGain['metrics']>): SkillGain {
    return {
      skillTypeId,
      fromLevel: 1,
      toLevel: 2,
      delta: { changes: [], count: 1 },
      metrics: {
        overall: 0,
        dps: 0,
        ehp: 0,
        activeTank: 0,
        speed: 0,
        align: 0,
        capacitor: 0,
        lockRange: 0,
        ...metrics,
      },
    };
  }

  it('orders by the chosen stat, largest gain first, ties by skill id', () => {
    const gains = [
      gain(3, { overall: 0.3, dps: 0 }),
      gain(1, { overall: 0.1, dps: 0.1 }),
      gain(2, { overall: 0.1, dps: 0.2 }),
    ];
    expect(rankSkillGains(gains, 'overall').map((g) => g.skillTypeId)).toEqual([3, 1, 2]);
    expect(rankSkillGains(gains, 'dps').map((g) => g.skillTypeId)).toEqual([2, 1, 3]);
    // Not in place.
    expect(gains.map((g) => g.skillTypeId)).toEqual([3, 1, 2]);
  });
});

describe('trainingTimeFor', () => {
  it('totals the schedule, prerequisites included, and says when there are any', () => {
    expect(
      trainingTimeFor(
        [
          { skillTypeID: 5, seconds: 100 },
          { skillTypeID: 9, seconds: 50 },
        ],
        9
      )
    ).toEqual({ seconds: 150, includesPrerequisites: true });
    expect(trainingTimeFor([{ skillTypeID: 9, seconds: 80 }], 9)).toEqual({
      seconds: 80,
      includesPrerequisites: false,
    });
  });
});
