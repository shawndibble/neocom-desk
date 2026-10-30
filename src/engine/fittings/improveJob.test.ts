import { describe, expect, it } from 'vitest';
import {
  brokenGuardrail,
  improveCandidates,
  scoreOf,
  DEFAULT_IMPROVE_HOLD,
  type ImproveCandidate,
} from './improve';
import { findMakeover } from './improveMakeover';
import {
  DEFAULT_EXPLORE_SPACE,
  DEFAULT_IMPROVE_JOB,
  EXPLORE_SPACES,
  FREED_JOBS,
  IMPROVE_JOBS,
  JOB_WEIGHTS,
  dropLimitsOf,
  firstLimitBreach,
  JOB_NEEDS,
  jobSettingOf,
  propulsionNeedOf,
  overallWeightsOf,
  unguardedJobs,
} from './improveJob';
import { improveOverall } from './skillGains';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingModule, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

/** Base stats with the figures a job weighs set explicitly. */
function statsWith(
  edit: { dps?: number; ehp?: number; sustained?: number; speed?: number } = {}
): FittingStats {
  const base = baseFittingStats();
  return {
    ...base,
    ehp: edit.ehp ?? base.ehp,
    offense: {
      ...base.offense,
      dps: edit.dps ?? base.offense.dps,
      sustainedDps: edit.dps ?? base.offense.sustainedDps,
    },
    navigation: { ...base.navigation, maxVelocity: edit.speed ?? base.navigation.maxVelocity },
    tank: { ...base.tank, sustainedEffective: edit.sustained ?? 1000 },
  };
}

describe('the Improve Job tables', () => {
  it('names the three jobs, PvE and Dangerous by default', () => {
    expect(IMPROVE_JOBS).toEqual(['pve', 'pvp', 'explore']);
    expect(DEFAULT_IMPROVE_JOB).toBe('pve');
    expect(EXPLORE_SPACES).toEqual(['dangerous', 'safe']);
    expect(DEFAULT_EXPLORE_SPACE).toBe('dangerous');
  });

  it('frees scram and web for PvE, nothing for PvP or Explore', () => {
    expect(FREED_JOBS.pve).toEqual(['scram', 'web']);
    expect(FREED_JOBS.pvp).toEqual([]);
    expect(FREED_JOBS.explore).toEqual([]);
  });

  it('holds each job its own weights', () => {
    expect(JOB_WEIGHTS.pve).toMatchObject({
      dps: 1,
      ehp: 1,
      sustained: 1,
      speed: 0.25,
      align: 0.25,
    });
    expect(JOB_WEIGHTS.pvp).toMatchObject({
      sustained: 0.25,
      speed: 1,
      align: 0.75,
      lockRange: 0.5,
    });
    expect(JOB_WEIGHTS.explore).toMatchObject({ dps: 0.25, ehp: 0.5, speed: 0.75, align: 1 });
  });

  it('turns the sustained weight into the active tank term', () => {
    expect(overallWeightsOf('pvp').activeTank).toBe(0.25);
    expect(overallWeightsOf('pvp').dps).toBe(1);
  });

  it('adds a job freed jobs to the goal scored ones', () => {
    expect(unguardedJobs('overall', 'pve')).toEqual(
      expect.arrayContaining(['cap', 'scram', 'web'])
    );
    expect(unguardedJobs('overall', 'pvp')).toEqual(['cap']);
    expect(unguardedJobs('overall')).toEqual(['cap']);
    expect(unguardedJobs('explore', 'explore')).toEqual([]);
  });
});

describe('what a job needs of the fit (#5578)', () => {
  it('PvE needs any propulsion, Explore an MWD, PvP nothing', () => {
    expect(JOB_NEEDS).toEqual({
      pve: { propulsion: 'any' },
      pvp: { propulsion: null },
      explore: { propulsion: 'mwd' },
    });
    expect(propulsionNeedOf(jobSettingOf('pve'))).toBe('any');
    expect(propulsionNeedOf(jobSettingOf('explore'))).toBe('mwd');
    expect(propulsionNeedOf(jobSettingOf('pvp'))).toBeNull();
    expect(propulsionNeedOf(undefined)).toBeNull();
  });

  it('the PvE opt-out drops the need; Explore ignores it', () => {
    expect(propulsionNeedOf(jobSettingOf('pve', 'dangerous', true))).toBeNull();
    expect(propulsionNeedOf(jobSettingOf('explore', 'dangerous', true))).toBe('mwd');
  });
});

describe('dropLimitsOf', () => {
  it('PvE: damage 10%', () => {
    expect(dropLimitsOf('overall', jobSettingOf('pve'))).toEqual({ damage: 0.1 });
  });
  it('PvP: damage, speed and EHP 10%', () => {
    expect(dropLimitsOf('overall', jobSettingOf('pvp'))).toEqual({
      damage: 0.1,
      speed: 0.1,
      ehp: 0.1,
    });
  });
  it('Explore Safe: speed only; Dangerous adds EHP and sustained tank', () => {
    expect(dropLimitsOf('overall', jobSettingOf('explore', 'safe'))).toEqual({ speed: 0.1 });
    expect(dropLimitsOf('overall', jobSettingOf('explore', 'dangerous'))).toEqual({
      speed: 0.1,
      ehp: 0.1,
      sustained: 0.1,
    });
    expect(dropLimitsOf('overall', jobSettingOf('explore'))).toEqual(
      dropLimitsOf('overall', jobSettingOf('explore', 'dangerous'))
    );
  });
  it('never binds on the goal own stat', () => {
    expect(dropLimitsOf('damage', jobSettingOf('pvp'))).toEqual({ speed: 0.1, ehp: 0.1 });
    expect(dropLimitsOf('speed', jobSettingOf('pvp'))).toEqual({ damage: 0.1, ehp: 0.1 });
    expect(dropLimitsOf('tank', jobSettingOf('pvp'))).toEqual({ damage: 0.1, speed: 0.1 });
  });
  it('is empty with no job', () => {
    expect(dropLimitsOf('overall', undefined)).toEqual({});
  });
});

describe('firstLimitBreach', () => {
  const figures = (s: FittingStats) => ({
    damage: s.offense.dps,
    speed: s.navigation.maxVelocity,
    ehp: s.ehp,
    sustained: s.tank.sustainedEffective,
  });
  it('flags a drop past the limit and lets one within it pass', () => {
    const limits = { damage: 0.1 };
    expect(firstLimitBreach(limits, figures(statsWith()), figures(statsWith({ dps: 89 })))).toBe(
      'damage'
    );
    expect(
      firstLimitBreach(limits, figures(statsWith()), figures(statsWith({ dps: 91 })))
    ).toBeNull();
    expect(
      firstLimitBreach(limits, figures(statsWith()), figures(statsWith({ dps: 300 })))
    ).toBeNull();
  });
  it('ignores a figure the fit never had', () => {
    const none = figures(statsWith({ sustained: 0 }));
    expect(firstLimitBreach({ sustained: 0.1 }, none, none)).toBeNull();
  });
});

describe('job-weighted overall', () => {
  const before = statsWith();
  const fasterWeaker = statsWith({ speed: 300, dps: 90 });
  it('rates a speed gain higher under PvP than PvE', () => {
    const pve = improveOverall(before, fasterWeaker, overallWeightsOf('pve'));
    const pvp = improveOverall(before, fasterWeaker, overallWeightsOf('pvp'));
    expect(pvp).toBeGreaterThan(pve);
  });
  it('scoreOf with a job uses its weights; without one is today', () => {
    expect(scoreOf('overall', before, fasterWeaker, null, undefined, DEFAULT_IMPROVE_HOLD)).toBe(
      improveOverall(before, fasterWeaker)
    );
    expect(
      scoreOf('overall', before, fasterWeaker, null, undefined, DEFAULT_IMPROVE_HOLD, 'pvp')
    ).toBe(improveOverall(before, fasterWeaker, overallWeightsOf('pvp')));
  });
  it('sustained tank counts quarter under PvP', () => {
    const better = statsWith({ sustained: 2000 });
    const pve = improveOverall(before, better, overallWeightsOf('pve'));
    const pvp = improveOverall(before, better, overallWeightsOf('pvp'));
    expect(pvp).toBeCloseTo(pve / 4, 6);
  });
});

describe('brokenGuardrail with a job', () => {
  const before = statsWith();
  const tankLoss = statsWith({ ehp: 800 });
  it('single swaps: only Explore Dangerous guards tank', () => {
    expect(
      brokenGuardrail('overall', before, tankLoss, undefined, undefined, {
        jobSetting: jobSettingOf('explore', 'dangerous'),
      })
    ).toBe('keepsTank');
    expect(
      brokenGuardrail('overall', before, tankLoss, undefined, undefined, {
        jobSetting: jobSettingOf('explore', 'safe'),
      })
    ).toBeNull();
    expect(
      brokenGuardrail('overall', before, tankLoss, undefined, undefined, {
        jobSetting: jobSettingOf('pvp'),
      })
    ).toBeNull();
    expect(brokenGuardrail('overall', before, tankLoss, undefined, undefined)).toBeNull();
  });
  it('a whole makeover is held to every limit', () => {
    expect(
      brokenGuardrail('overall', before, tankLoss, undefined, undefined, {
        jobSetting: jobSettingOf('pvp'),
        makeover: true,
      })
    ).toBe('keepsTank');
    expect(
      brokenGuardrail('overall', before, statsWith({ dps: 80 }), undefined, undefined, {
        jobSetting: jobSettingOf('pve'),
        makeover: true,
      })
    ).toBe('keepsStats');
    expect(
      brokenGuardrail('overall', before, statsWith({ dps: 95 }), undefined, undefined, {
        jobSetting: jobSettingOf('pve'),
        makeover: true,
      })
    ).toBeNull();
  });
  it('a Safe Explore makeover may lose tank but not speed', () => {
    const opts = { jobSetting: jobSettingOf('explore', 'safe'), makeover: true };
    expect(brokenGuardrail('overall', before, tankLoss, undefined, undefined, opts)).toBeNull();
    expect(
      brokenGuardrail('overall', before, statsWith({ speed: 150 }), undefined, undefined, opts)
    ).toBe('keepsStats');
  });
});

describe('improveCandidates with a job', () => {
  // group 52 scram, 46 propulsion; a Tech I and a Tech II of each rack medium.
  const groups: Record<number, number> = { 1: 52, 2: 52, 3: 46, 4: 46 };
  const index = buildVariationIndex(
    {
      1: { parentTypeId: null, metaGroupId: 1 },
      2: { parentTypeId: 1, metaGroupId: 2 },
      3: { parentTypeId: null, metaGroupId: 1 },
      4: { parentTypeId: 3, metaGroupId: 2 },
    },
    { 1: 'Tech I', 2: 'Tech II' }
  );
  const rackOf = { '1': 'medium', '2': 'medium', '3': 'medium', '4': 'medium' };
  const pool = {
    groupOf: (id: number) => groups[id],
    typeIdsInGroup: (g: number) =>
      Object.keys(groups)
        .map(Number)
        .filter((id) => groups[id] === g),
    published: () => true,
  };
  const modules = [{ slot: 'medium', slotIndex: 0, typeId: 1, state: 'online' }] as FittingModule[];
  const run = (job?: 'pve' | 'pvp') =>
    improveCandidates(modules, index, rackOf, {
      reach: 'rework',
      goal: 'overall',
      pool,
      jobSetting: job && jobSettingOf(job),
    });

  it('guards the last scram under no job and PvP, frees it under PvE', () => {
    expect(run().some((c) => c.toTypeId === 3 || c.toTypeId === 4)).toBe(false);
    expect(run('pvp').some((c) => c.toTypeId === 4)).toBe(false);
    expect(run('pve').some((c) => c.toTypeId === 4)).toBe(true);
  });
});

describe('findMakeover with a job', () => {
  // Two low slots; each swap 1 -> 2 adds EHP and costs 6% damage, so both together cost 12%.
  const stats = async (f: Fitting): Promise<FittingStats> => {
    const swapped = f.modules.filter((m) => m.typeId > 1 && m.typeId % 2 === 0).length;
    const base = statsWith({ ehp: 1000 + 300 * swapped, dps: 100 - 6 * swapped });
    return { ...base, offense: { ...base.offense, sustainedDps: 100 - 6 * swapped } };
  };
  const fitting = {
    shipTypeId: 1,
    name: 'T',
    modules: [0, 1].map((slotIndex) => ({
      slot: 'low',
      slotIndex,
      typeId: 1 + 2 * slotIndex,
      state: 'online',
    })),
  } as unknown as Fitting;
  const moves = (f: Fitting): ImproveCandidate[] =>
    f.modules
      .filter((m) => m.typeId % 2 === 1)
      .map((m) => ({
        fromTypeId: m.typeId,
        toTypeId: m.typeId + 1,
        at: [{ slot: m.slot, slotIndex: m.slotIndex }],
      }));
  const run = async (job?: 'pve') =>
    findMakeover({
      fitting,
      before: await stats(fitting),
      goal: 'overall',
      moves,
      stats,
      priceOf: () => null,
      jobSetting: job && jobSettingOf(job),
    });

  it('without a job both swaps are made', async () => {
    expect((await run())?.makeover?.rows.length).toBe(2);
  });

  it('PvE stops the step that would take damage past 10%', async () => {
    const result = await run('pve');
    expect(result?.makeover).toBeNull();
  });
});

describe('Explore holds the explorer kit and, in dangerous space, the tank modules', () => {
  // 5 and 6 are two different analyzers (group 538, job analyzer); 7 a shield extender (tank group 38);
  // 3 and 4 are propulsion (46), which the overall goal reworks into.
  const groups: Record<number, number> = { 3: 46, 4: 46, 5: 538, 6: 538, 7: 38 };
  const index = buildVariationIndex(
    Object.fromEntries(
      Object.keys(groups).map((id) => [id, { parentTypeId: null, metaGroupId: 2 }])
    ),
    { 2: 'Tech II' }
  );
  const rackOf = Object.fromEntries(Object.keys(groups).map((id) => [id, 'medium']));
  const pool = {
    groupOf: (id: number) => groups[id],
    typeIdsInGroup: (g: number) =>
      Object.keys(groups)
        .map(Number)
        .filter((id) => groups[id] === g),
    published: () => true,
  };
  const modules = [5, 6, 7].map((typeId, slotIndex) => ({
    slot: 'medium',
    slotIndex,
    typeId,
    state: 'online',
  })) as FittingModule[];
  const moves = (job?: 'pvp' | 'explore', space?: 'safe' | 'dangerous') =>
    improveCandidates(modules, index, rackOf, {
      reach: 'rework',
      goal: 'overall',
      pool,
      jobSetting: job && jobSettingOf(job, space),
    });
  const from = (list: ImproveCandidate[], typeId: number) =>
    list.filter((c) => c.fromTypeId === typeId).map((c) => c.toTypeId);

  it('keeps every analyzer under Explore, but only the last under PvP', () => {
    expect(from(moves('explore', 'safe'), 5)).not.toContain(3);
    expect(from(moves('pvp'), 5)).toContain(3);
  });

  it('keeps a tank module a tank module only in dangerous space', () => {
    expect(from(moves('explore', 'dangerous'), 7)).not.toContain(3);
    expect(from(moves('explore'), 7)).not.toContain(3);
    expect(from(moves('explore', 'safe'), 7)).toContain(3);
  });
});
