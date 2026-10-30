import { describe, expect, it } from 'vitest';
import {
  breakTies,
  commonGroups,
  commonPropulsionKind,
  groupShareOf,
  hullCommonality,
  jobsOfFitName,
  propulsionKindOf,
  removedCommonGroups,
  withinTie,
  type CommonalityFit,
  type PropulsionKind,
} from './hullCommonality';

// Types 1..9 are group 100 + type (so each type is its own group); 20/21 share group 46.
const groupOf = (typeId: number) => (typeId >= 20 ? 46 : 100 + typeId);
const kindOf = (typeId: number): PropulsionKind | null =>
  typeId === 20 ? 'afterburner' : typeId === 21 ? 'mwd' : typeId === 30 ? 'mjd' : null;

const fit = (name: string, ...moduleTypeIds: number[]): CommonalityFit => ({ name, moduleTypeIds });
const many = (count: number, name: string, ...moduleTypeIds: number[]) =>
  Array.from({ length: count }, () => fit(name, ...moduleTypeIds));

describe('jobsOfFitName', () => {
  it.each([
    ['Krenko L4 mission runner', ['pve']],
    ['PvE ratting', ['pve']],
    ['Angel Sanctum site', ['pve']],
    ['abyss T3 filament', ['pve']],
    ['Solo roam kite', ['pvp']],
    ['Nano gang', ['pvp']],
    ['Relic hacking', ['explore']],
    ['WH scanning', ['explore']],
    ['Wormhole exploration', ['explore']],
    ['PvE and PvP', ['pve', 'pvp']],
    ['My Drake', []],
    ['Rattlesnake', []],
    ['Whale', []],
    ['Level 5', []],
  ])('%s', (name, jobs) => expect(jobsOfFitName(name)).toEqual(jobs));
});

describe('propulsionKindOf', () => {
  it('reads the kind from the group and the name', () => {
    expect(propulsionKindOf(46, '10MN Afterburner II')).toBe('afterburner');
    expect(propulsionKindOf(46, '50MN Y-T8 Compact Microwarpdrive')).toBe('mwd');
    expect(propulsionKindOf(1189, 'Medium Micro Jump Drive')).toBe('mjd');
    expect(propulsionKindOf(52, 'Warp Scrambler II')).toBeNull();
    expect(propulsionKindOf(46, undefined)).toBeNull();
  });
});

describe('hullCommonality', () => {
  const fits = [
    ...many(6, 'PvE mission', 1, 2, 20),
    ...many(4, 'L4 site', 1, 3, 21),
    ...many(2, 'My brawl', 1, 2, 30),
  ];
  const common = hullCommonality(fits, groupOf, kindOf);

  it('shares per group, only for the fits of the job', () => {
    const pve = common.pve;
    expect(pve?.fits).toBe(10);
    expect(groupShareOf(pve, 101)).toBe(1);
    expect(groupShareOf(pve, 102)).toBeCloseTo(0.6);
    expect(groupShareOf(pve, 103)).toBeCloseTo(0.4);
    expect(groupShareOf(pve, 46)).toBe(1);
  });

  it('shares per propulsion kind, and never per variant', () => {
    expect(common.pve?.propulsion).toEqual({ afterburner: 0.6, mwd: 0.4, mjd: 0 });
    expect(commonPropulsionKind(common.pve)).toBe('afterburner');
    // Only group ids are keys: no type id appears.
    expect([...(common.pve?.groupShare.keys() ?? [])].sort((a, b) => a - b)).toEqual([
      46, 101, 102, 103,
    ]);
  });

  it('is null for a job with fewer than ten matching fits', () => {
    expect(common.pvp).toBeNull();
    expect(common.explore).toBeNull();
    expect(commonPropulsionKind(null)).toBeNull();
  });

  it('counts an unnamed fit for every job at half weight', () => {
    const c = hullCommonality([...many(8, 'PvE', 1), ...many(4, 'Drake', 2)], groupOf, kindOf);
    expect(c.pve?.fits).toBe(10);
    expect(groupShareOf(c.pve, 102)).toBeCloseTo(0.2);
    expect(c.pvp).toBeNull();
  });

  it('commonGroups lists groups at or above 25%, most common first', () => {
    const c = hullCommonality([...many(7, 'pve', 1, 2), ...many(3, 'pve', 3)], groupOf, kindOf);
    expect(commonGroups(c.pve)).toEqual([101, 102, 103]);
    const rare = hullCommonality([...many(9, 'pve', 1), fit('pve', 4)], groupOf, kindOf);
    expect(commonGroups(rare.pve)).toEqual([101]);
    expect(commonGroups(null)).toEqual([]);
  });
});

describe('ties', () => {
  it('withinTie is relative, 1%', () => {
    expect(withinTie(0.1, 0.1005)).toBe(true);
    expect(withinTie(0.1, 0.102)).toBe(false);
    expect(withinTie(0, 0)).toBe(true);
  });

  it('breakTies orders a near-tie by share and leaves a clear gap alone', () => {
    const items = [
      { id: 'a', score: 0.2, share: 0.1 },
      { id: 'b', score: 0.1995, share: 0.9 },
      { id: 'c', score: 0.15, share: 1 },
    ];
    const out = breakTies(
      items,
      (i) => i.score,
      (i) => i.share
    );
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(breakTies(items, (i) => i.score, undefined).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('removedCommonGroups', () => {
  const c = hullCommonality(
    [...many(9, 'pve', 1, 2, 3), ...many(1, 'pve', 1)],
    groupOf,
    kindOf
  ).pve;
  const row = (fromTypeId: number | null, toTypeId: number, count = 1) => ({
    fromTypeId,
    toTypeId,
    at: Array.from({ length: count }, () => ({})),
  });

  it('names a group at least 80% of fits keep that the Makeover takes off the fit', () => {
    expect(removedCommonGroups([{ typeId: 2 }], [row(2, 4)], groupOf, c)).toEqual([102]);
  });

  it('is quiet when a copy stays, the group is added back, or fewer than 80% keep it', () => {
    expect(removedCommonGroups([{ typeId: 2 }, { typeId: 2 }], [row(2, 4)], groupOf, c)).toEqual(
      []
    );
    expect(removedCommonGroups([{ typeId: 2 }], [row(2, 4), row(null, 2)], groupOf, c)).toEqual([]);
    const rare = hullCommonality([...many(5, 'pve', 2), ...many(5, 'pve', 3)], groupOf, kindOf).pve;
    expect(removedCommonGroups([{ typeId: 2 }], [row(2, 4)], groupOf, rare)).toEqual([]);
    expect(removedCommonGroups([{ typeId: 2 }], [row(2, 4)], groupOf, null)).toEqual([]);
  });
});
