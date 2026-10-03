import { describe, expect, it, vi } from 'vitest';
import type { AttributeWithSources, SourceLike } from './affectedBy';
import {
  evaluateSkillGains,
  gainMetrics,
  levelGain,
  levelOptions,
  pickedLevel,
  roleChanges,
  rankSkillGains,
  scheduledSkillTargets,
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
  offense: {
    weapons: [],
    dps: 100,
    sustainedDps: 100,
    volley: 500,
    overheated: null,
    chargelessWeaponCount: 0,
  },
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
    // Align counts half towards overall: damage and tank come first.
    expect(metrics.overall).toBeCloseTo(0.15);
  });

  it('weighs overall: damage and tank whole, mobility and reach half, cap time a quarter', () => {
    const unstable = withStats({ capacitor: { stable: false, depletesInSeconds: 200 } });
    const sooner = withStats({
      capacitor: { stable: false, depletesInSeconds: 180 },
      offense: { ...baseStats.offense, dps: 105 },
    });
    // Rapid Firing: +5% DPS outweighs running dry 10% sooner.
    const metrics = gainMetrics(unstable, sooner);
    expect(metrics.capacitor).toBeCloseTo(-0.1);
    expect(metrics.overall).toBeCloseTo(0.05 - 0.025);
    // Each metric itself stays unweighted, so ranking by one stat is unchanged.
    expect(metrics.dps).toBeCloseTo(0.05);
  });

  it('counts every metric whole on a fit that fires nothing: a hauler lives by its align time', () => {
    const hauler = withStats({ offense: { ...baseStats.offense, dps: 0 }, droneDps: 0 });
    const nimbler = withStats({
      ...hauler,
      navigation: { ...baseStats.navigation, agility: 3.6 },
    });
    expect(gainMetrics(hauler, nimbler).overall).toBeCloseTo(0.1);
  });

  it('counts the capacitor turning stable, or unstable, in full', () => {
    const unstable = withStats({ capacitor: { stable: false, depletesInSeconds: 120 } });
    expect(gainMetrics(unstable, baseStats).overall).toBe(1);
    expect(gainMetrics(baseStats, unstable).overall).toBe(-1);
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

describe('gainMetrics — non-combat roles', () => {
  const miner = withStats({
    offense: { ...baseStats.offense, dps: 0 },
    droneDps: 0,
    mining: { rows: [], perSecond: 2, perHour: 7200, wastePerSecond: 0, wastePct: 0 },
    holds: { cargo: 500, fleetHangar: 0, miningHold: 10000 },
  });

  it('scores mining yield as a relative gain in m³ an hour', () => {
    const after = withStats({
      ...miner,
      mining: { ...miner.mining, perSecond: 2.2, perHour: 7920 },
    });
    const metrics = gainMetrics(miner, after);
    expect(metrics.miningYield).toBeCloseTo(0.1);
    expect(metrics.overall).toBeCloseTo(0.1);
  });

  it('scores total hold space on an unarmed hull, and ignores it on an armed one', () => {
    const roomier = withStats({
      ...miner,
      holds: { cargo: 600, fleetHangar: 0, miningHold: 10000 },
    });
    expect(gainMetrics(miner, roomier).hold).toBeCloseTo(100 / 10500);
    const armedBefore = withStats({ holds: { cargo: 500, fleetHangar: 0, miningHold: 0 } });
    const armedAfter = withStats({ holds: { cargo: 600, fleetHangar: 0, miningHold: 0 } });
    expect(gainMetrics(armedBefore, armedAfter).hold).toBe(0);
  });

  it('scores remote repair handed out, and jump range', () => {
    const logi = withStats({
      support: { ...baseStats.support, remoteRepair: { shield: 0, armor: 100, hull: 0 } },
    });
    const better = withStats({
      support: { ...baseStats.support, remoteRepair: { shield: 0, armor: 110, hull: 0 } },
    });
    expect(gainMetrics(logi, better).remoteRepair).toBeCloseTo(0.1);
    const drive = { rangeLightYears: 5, fuelTypeId: 1, fuelPerLightYear: 100 };
    const jumper = withStats({ jumpDrive: drive });
    const farther = withStats({ jumpDrive: { ...drive, rangeLightYears: 6 } });
    expect(gainMetrics(jumper, farther).jumpRange).toBeCloseTo(0.2);
    expect(gainMetrics(baseStats, baseStats).jumpRange).toBe(0);
  });
});

describe('gainMetrics — weapon reach', () => {
  function turret(optimal: number, falloff: number, tracking: number) {
    return {
      kind: 'turret' as const,
      dps: 400,
      optimal,
      falloff,
      tracking,
      optimalSigRadius: 400,
    };
  }
  function railgunFit(optimal: number, falloff: number, tracking: number): FittingStats {
    return withStats({
      applied: {
        droneControlRange: 60000,
        weapons: [
          turret(optimal, falloff, tracking),
          // A drone's reach is not the guns': never compared.
          {
            kind: 'drone',
            dps: 100,
            speed: 3000,
            optimal: 0,
            falloff: 0,
            tracking: 3,
            optimalSigRadius: 0,
          },
        ],
      },
    });
  }
  const rails = railgunFit(100000, 30000, 2);

  it('scores optimal range, falloff and tracking (Sharpshooter, Trajectory Analysis, Motion Prediction)', () => {
    expect(gainMetrics(rails, railgunFit(105000, 30000, 2)).optimal).toBeCloseTo(0.05);
    expect(gainMetrics(rails, railgunFit(100000, 33000, 2)).falloff).toBeCloseTo(0.1);
    expect(gainMetrics(rails, railgunFit(100000, 30000, 2.1)).tracking).toBeCloseTo(0.05);
  });

  it('counts reach half towards overall', () => {
    expect(gainMetrics(rails, railgunFit(105000, 30000, 2)).overall).toBeCloseTo(0.025);
  });

  it('lists each as a change, range in km', () => {
    expect(roleChanges(rails, railgunFit(105000, 33000, 2.1))).toEqual([
      { key: 'optimal', before: 100, after: 105 },
      { key: 'falloff', before: 30, after: 33 },
      { key: 'tracking', before: 2, after: 2.1 },
    ]);
  });

  it("takes a missile's flight range as its optimal", () => {
    const launcher = (range: number) =>
      withStats({
        applied: {
          droneControlRange: 0,
          weapons: [
            {
              kind: 'missile',
              dps: 300,
              range,
              explosionRadius: 100,
              explosionVelocity: 100,
              damageReductionFactor: 0.5,
            },
          ],
        },
      });
    expect(gainMetrics(launcher(50000), launcher(55000)).optimal).toBeCloseTo(0.1);
  });

  it('is zero on a fit with no guns or launchers', () => {
    const metrics = gainMetrics(baseStats, baseStats);
    expect([metrics.optimal, metrics.falloff, metrics.tracking]).toEqual([0, 0, 0]);
  });
});

describe('gainMetrics — fleet boosts', () => {
  const burst = {
    typeId: 43551,
    chargeTypeId: 42829,
    count: 1,
    strengths: [50, 2.5],
    rangeMeters: 50_000,
    durationSeconds: 60,
    reloadSeconds: 60,
  };
  const orca = withStats({
    offense: { ...baseStats.offense, dps: 0 },
    fleetSupport: {
      bursts: [burst],
      compressors: [{ typeId: 62625, count: 1, rangeMeters: 80_000, cycleSeconds: 60 }],
      core: { typeId: 58950, fuelTypeId: 16_272, fuelPerCycle: 400, cycleSeconds: 150 },
    },
  });
  const withBurst = (patch: Partial<typeof burst>) =>
    withStats({
      ...orca,
      fleetSupport: { ...orca.fleetSupport, bursts: [{ ...burst, ...patch }] },
    });

  it('scores a stronger, longer or farther-reaching burst as a gain', () => {
    expect(gainMetrics(orca, withBurst({ strengths: [55, 2.75] })).burstStrength).toBeCloseTo(0.1);
    expect(gainMetrics(orca, withBurst({ durationSeconds: 66 })).burstDuration).toBeCloseTo(0.1);
    expect(gainMetrics(orca, withBurst({ rangeMeters: 55_000 })).burstRange).toBeCloseTo(0.1);
  });

  it('scores a shorter burst reload, and less fuel a cycle, as a gain', () => {
    expect(gainMetrics(orca, withBurst({ reloadSeconds: 30 })).burstReload).toBeCloseTo(0.5);
    const leaner = withStats({
      ...orca,
      fleetSupport: {
        ...orca.fleetSupport,
        core: { ...orca.fleetSupport.core!, fuelPerCycle: 300 },
      },
    });
    expect(gainMetrics(orca, leaner).coreFuel).toBeCloseTo(0.25);
    expect(gainMetrics(leaner, orca).coreFuel).toBeCloseTo(-1 / 3);
  });

  it('scores compressor range', () => {
    const farther = withStats({
      ...orca,
      fleetSupport: {
        ...orca.fleetSupport,
        compressors: [{ typeId: 62625, count: 1, rangeMeters: 120_000, cycleSeconds: 60 }],
      },
    });
    expect(gainMetrics(orca, farther).compressionRange).toBeCloseTo(0.5);
  });

  it('sees a skill that raises only the weaker of two bursts', () => {
    const shield = { ...burst, typeId: 1, strengths: [30], rangeMeters: 60_000 };
    const skirmish = { ...burst, typeId: 2, strengths: [25], rangeMeters: 40_000 };
    const fit = (second: typeof skirmish) =>
      withStats({
        ...orca,
        fleetSupport: { ...orca.fleetSupport, bursts: [shield, second] },
      });
    const before = fit(skirmish);
    const after = fit({ ...skirmish, strengths: [27.5], rangeMeters: 44_000 });
    const metrics = gainMetrics(before, after);
    expect(metrics.burstStrength).toBeCloseTo(0.1);
    expect(metrics.burstRange).toBeCloseTo(0.1);
    expect(roleChanges(before, after)).toContainEqual({
      key: 'burstStrength',
      before: 25,
      after: 27.5,
    });
  });

  it('counts no gain for a reload that was nothing before', () => {
    const before = withBurst({ reloadSeconds: 0 });
    expect(gainMetrics(before, withBurst({ reloadSeconds: 30 })).burstReload).toBe(0);
  });

  it('is zero on a fit with no bursts or core', () => {
    const metrics = gainMetrics(baseStats, baseStats);
    expect(metrics.burstStrength).toBe(0);
    expect(metrics.coreFuel).toBe(0);
  });

  it('keeps a skill whose only effect is a fleet boost, listing it as a role change', async () => {
    const compare = async () => ({ before: orca, after: withBurst({ reloadSeconds: 30 }) });
    const gains = await evaluateSkillGains(
      [{ skillTypeId: 3354, fromLevel: 4, toLevel: 5 }],
      compare
    );
    expect(gains?.[0]?.roleChanges).toEqual([{ key: 'burstReload', before: 60, after: 30 }]);
    expect(gains?.[0]?.metrics.overall).toBeCloseTo(0.5);
  });
});

describe('levelGain', () => {
  it('words one level: the displayed changes, the role changes and the scores, even when none moved', () => {
    const after = withStats({ offense: { ...baseStats.offense, dps: 110 } });
    const gain = levelGain(baseStats, after);
    expect(gain.delta.changes.map((change) => change.key)).toContain('totalDps');
    expect(gain.roleChanges).toEqual([]);
    expect(gain.metrics.dps).toBeCloseTo(0.1);
    const same = levelGain(baseStats, baseStats);
    expect(same.delta.count).toBe(0);
    expect(same.metrics.overall).toBe(0);
  });
});

describe('levelOptions', () => {
  it('lists the levels above what the pilot has, flagging those a plan already trains', () => {
    expect(levelOptions(2, 3)).toEqual([
      { level: 3, planned: true },
      { level: 4, planned: false },
      { level: 5, planned: false },
    ]);
    expect(levelOptions(0, 0).map((option) => option.level)).toEqual([1, 2, 3, 4, 5]);
    expect(levelOptions(4, 0)).toEqual([{ level: 5, planned: false }]);
  });

  it('counts a plan that trains below what the pilot has as planning nothing', () => {
    expect(levelOptions(3, 2).every((option) => !option.planned)).toBe(true);
  });
});

describe('pickedLevel', () => {
  const options = levelOptions(2, 3);

  it('is the first level not in a plan until the pilot picks one', () => {
    expect(pickedLevel(options, null)).toBe(4);
  });

  it('keeps a pick that is still open, and drops one a plan has since taken', () => {
    expect(pickedLevel(options, 5)).toBe(5);
    expect(pickedLevel(options, 3)).toBe(4);
  });

  it('is null once every level is in a plan', () => {
    expect(pickedLevel(levelOptions(2, 5), 4)).toBeNull();
    expect(pickedLevel([], null)).toBeNull();
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

  it('keeps a mining skill for a mining fit and lists its role change', async () => {
    const miner = withStats({
      offense: { ...baseStats.offense, dps: 0 },
      mining: { rows: [], perSecond: 2, perHour: 7200, wastePerSecond: 0, wastePct: 0 },
    });
    const compare = async () => ({
      before: miner,
      after: withStats({
        ...miner,
        mining: { ...miner.mining, perSecond: 2.2, perHour: 7920 },
      }),
    });
    const gains = await evaluateSkillGains([candidates[0]!], compare);
    expect(gains).toHaveLength(1);
    expect(gains?.[0]?.roleChanges).toEqual([{ key: 'miningYield', before: 7200, after: 7920 }]);
  });

  it('drops a role change that rounds away', async () => {
    const miner = withStats({
      mining: { rows: [], perSecond: 2, perHour: 7200, wastePerSecond: 0, wastePct: 0 },
    });
    const compare = async () => ({
      before: miner,
      after: withStats({ ...miner, mining: { ...miner.mining, perHour: 7200.2 } }),
    });
    expect(await evaluateSkillGains([candidates[0]!], compare)).toEqual([]);
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
      roleChanges: [],
      metrics: {
        overall: 0,
        dps: 0,
        ehp: 0,
        activeTank: 0,
        speed: 0,
        align: 0,
        capacitor: 0,
        lockRange: 0,
        optimal: 0,
        falloff: 0,
        tracking: 0,
        miningYield: 0,
        hold: 0,
        remoteRepair: 0,
        jumpRange: 0,
        burstStrength: 0,
        burstRange: 0,
        burstDuration: 0,
        burstReload: 0,
        compressionRange: 0,
        coreFuel: 0,
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

describe('scheduledSkillTargets', () => {
  it('gives each scheduled skill once, at its highest level, in the order it first trains', () => {
    expect(
      scheduledSkillTargets([
        { skillTypeID: 5, level: 1 },
        { skillTypeID: 5, level: 2 },
        { skillTypeID: 9, level: 3 },
        { skillTypeID: 5, level: 3 },
      ])
    ).toEqual([
      { skillTypeID: 5, targetLevel: 3 },
      { skillTypeID: 9, targetLevel: 3 },
    ]);
    expect(scheduledSkillTargets([])).toEqual([]);
  });
});
