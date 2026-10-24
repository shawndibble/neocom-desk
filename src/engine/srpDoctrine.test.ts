import { describe, it, expect } from 'vitest';
import {
  basesOfFromData,
  killmailFittedSet,
  matchDoctrine,
  type DoctrineCandidate,
  type FittedSet,
} from '@/engine/srpDoctrine';

// Types: 1 hull, 10-13 mods, 20 rig, 21 rig, 30 charge, 40 abyssal of bases 10/11, 50 subsystem
const rackByType: Record<number, string> = {
  10: 'high',
  11: 'high',
  12: 'medium',
  13: 'low',
  20: 'rig',
  21: 'rig',
  40: 'high',
  50: 'subsystem',
};
const rackOf = (t: number) => rackByType[t];
const basesOf = basesOfFromData({
  mutaplasmids: { '900': { result: 40, bases: [10, 11] }, '901': { result: 40, bases: [11, 14] } },
});

const doctrine = (id: string, modules: number[], rigs: number[], hull = 1): DoctrineCandidate => ({
  id,
  fit: { hullTypeId: hull, name: id, modules, rigs },
});
const fitted = (modules: number[], rigs: number[], hull = 1): FittedSet => ({
  hullTypeId: hull,
  modules,
  rigs,
});

describe('killmailFittedSet', () => {
  it('counts destroyed and dropped, slot flags only', () => {
    const set = killmailFittedSet(
      {
        ship_type_id: 1,
        items: [
          { item_type_id: 12, flag: 19, quantity_destroyed: 1 },
          { item_type_id: 10, flag: 27, quantity_dropped: 1 },
          { item_type_id: 13, flag: 11, quantity_destroyed: 1 },
          { item_type_id: 20, flag: 92, quantity_destroyed: 1 },
          { item_type_id: 50, flag: 125, quantity_dropped: 1 },
        ],
      },
      rackOf
    );
    expect(set).toEqual({ hullTypeId: 1, modules: [10, 12, 13, 50], rigs: [20] });
  });
  it('ignores a charge sharing a slot flag, cargo, drone bay and bay fighters', () => {
    const set = killmailFittedSet(
      {
        ship_type_id: 1,
        items: [
          { item_type_id: 10, flag: 27, quantity_destroyed: 1 },
          { item_type_id: 30, flag: 27, quantity_destroyed: 5 },
          { item_type_id: 12, flag: 5, quantity_dropped: 1 },
          { item_type_id: 11, flag: 87, quantity_dropped: 1 },
          { item_type_id: 13, flag: 158, quantity_dropped: 1 },
        ],
      },
      rackOf
    );
    expect(set.modules).toEqual([10]);
  });
  it('skips zero-quantity items and a module in the wrong rack flag', () => {
    const set = killmailFittedSet(
      {
        ship_type_id: 1,
        items: [
          { item_type_id: 10, flag: 27 },
          { item_type_id: 12, flag: 27, quantity_destroyed: 1 },
        ],
      },
      rackOf
    );
    expect(set.modules).toEqual([]);
  });
});

describe('matchDoctrine', () => {
  const alpha = doctrine('alpha', [10, 12, 13], [20, 21]);

  it('no doctrine for the hull is not-checked', () => {
    expect(matchDoctrine(fitted([10], []), [doctrine('x', [10], [], 2)])).toEqual({
      status: 'not-checked',
    });
    expect(matchDoctrine(fitted([10], []), [])).toEqual({ status: 'not-checked' });
  });
  it('exact fit matches, order ignored', () => {
    expect(matchDoctrine(fitted([13, 10, 12], [21, 20]), [alpha])).toEqual({
      status: 'matched',
      doctrineId: 'alpha',
    });
  });
  it('matches any one of several fits and names it', () => {
    const beta = doctrine('beta', [11, 12, 13], [20, 21]);
    expect(matchDoctrine(fitted([11, 12, 13], [20, 21]), [alpha, beta])).toEqual({
      status: 'matched',
      doctrineId: 'beta',
    });
  });
  it('a missing module is off doctrine with the diff', () => {
    expect(matchDoctrine(fitted([10, 12], [20, 21]), [alpha])).toEqual({
      status: 'off-doctrine',
      doctrineId: 'alpha',
      diff: { missingModules: [13], extraModules: [], missingRigs: [], extraRigs: [] },
    });
  });
  it('extra and swapped modules and rigs show in the diff', () => {
    const r = matchDoctrine(fitted([10, 12, 13, 11], [20]), [alpha]);
    expect(r.diff).toEqual({
      missingModules: [],
      extraModules: [11],
      missingRigs: [21],
      extraRigs: [],
    });
    const swapped = matchDoctrine(fitted([10, 12, 13], [20, 20]), [alpha]);
    expect(swapped.diff).toMatchObject({ missingRigs: [21], extraRigs: [20] });
  });
  it('counts duplicates (multiset)', () => {
    const twin = doctrine('twin', [10, 10], []);
    expect(matchDoctrine(fitted([10], []), [twin]).status).toBe('off-doctrine');
    expect(matchDoctrine(fitted([10, 10], []), [twin]).status).toBe('matched');
  });
  it('diffs against the nearest fit', () => {
    const far = doctrine('far', [11, 11, 11], []);
    const r = matchDoctrine(fitted([10, 12, 13], [20]), [far, alpha]);
    expect(r.doctrineId).toBe('alpha');
    expect(r.diff?.missingRigs).toEqual([21]);
  });
  it('T3 subsystems must match', () => {
    const t3 = doctrine('t3', [10, 50], []);
    expect(matchDoctrine(fitted([10, 50], []), [t3]).status).toBe('matched');
    expect(matchDoctrine(fitted([10], []), [t3]).diff?.missingModules).toEqual([50]);
  });
  it('a mutated module matches a doctrine module that is one of its bases', () => {
    const d = doctrine('mut', [10, 12], []);
    expect(matchDoctrine(fitted([40, 12], []), [d], basesOf).status).toBe('matched');
    const d11 = doctrine('mut11', [11, 12], []);
    expect(matchDoctrine(fitted([40, 12], []), [d11], basesOf).status).toBe('matched');
  });
  it('a mutated module whose bases exclude the doctrine module is off doctrine', () => {
    const d = doctrine('x', [13, 12], []);
    const r = matchDoctrine(fitted([40, 12], []), [d], basesOf);
    expect(r.status).toBe('off-doctrine');
    expect(r.diff).toMatchObject({ missingModules: [13], extraModules: [40] });
  });
  it('without base data a mutated module is just an unknown type', () => {
    expect(matchDoctrine(fitted([40, 12], []), [doctrine('d', [10, 12], [])]).status).toBe(
      'off-doctrine'
    );
  });
  it('mutated modules are paired optimally, not greedily', () => {
    // 40 can be 10 or 11; plain 11 only fits 11. Doctrine wants 10 and 11.
    const d = doctrine('d', [10, 11], []);
    expect(matchDoctrine(fitted([40, 11], []), [d], basesOf).status).toBe('matched');
    // two mutated, doctrine has one base slot only
    expect(
      matchDoctrine(fitted([40, 40], []), [doctrine('e', [10], [])], basesOf).diff
    ).toMatchObject({
      extraModules: [40],
    });
  });
  it('a bare abyssal doctrine module matches the same type exactly', () => {
    expect(matchDoctrine(fitted([40], []), [doctrine('d', [40], [])], basesOf).status).toBe(
      'matched'
    );
  });
});

describe('basesOfFromData', () => {
  it('unions bases across mutaplasmids; undefined for a non-abyssal type', () => {
    expect(basesOf(40)?.slice().sort()).toEqual([10, 11, 14]);
    expect(basesOf(10)).toBeUndefined();
  });
});
