import { describe, expect, it } from 'vitest';
import { MUTAPLASMID_BASES } from './data/srpDoctrineData.js';
import { checkDoctrine, fittedFromKillmail } from './srpDoctrineCheck.js';
import type { DoctrineFit, HullRule } from './srpTypes.js';

const HULL = 587;
const [muta] = MUTAPLASMID_BASES;
const slotted = (type: number, flag: number, qty = 1) => ({
  item_type_id: type,
  flag,
  quantity_destroyed: qty,
  quantity_dropped: 0,
});
// SDE slot map: 405 high, 4395 rig; 47408 is an abyssal medium module.
const HIGH = 405;
const RIG = 4395;
const MED_FLAG = 19;

const fit = (id: string, over: Partial<DoctrineFit['snapshot']> = {}): DoctrineFit => ({
  id,
  name: `Fit ${id}`,
  snapshot: { hullTypeId: HULL, name: `Fit ${id}`, modules: [], rigs: [], ...over },
  createdBy: 1,
  createdAt: 1,
});
const rule = (doctrineIds?: string[]): HullRule => ({
  scope: 'hull',
  id: HULL,
  kind: 'pay-percent',
  ...(doctrineIds ? { doctrineIds } : {}),
});
const victim = (items: ReturnType<typeof slotted>[]) => ({
  characterId: 1,
  corporationId: 2,
  shipTypeId: HULL,
  items,
});

describe('fittedFromKillmail', () => {
  it('counts slotted modules and rigs; cargo, charges and wrong-rack items do not count', () => {
    const f = fittedFromKillmail(
      victim([
        slotted(HIGH, 27, 2),
        slotted(RIG, 92),
        slotted(HIGH, 5), // cargo flag
        slotted(34, 27), // a charge-like item in a high slot: not in the slot map
        slotted(RIG, 27), // wrong rack for its flag
      ])
    );
    expect(f).toEqual({ hullTypeId: HULL, modules: [HIGH, HIGH], rigs: [RIG] });
  });
});

describe('checkDoctrine', () => {
  const none = new Map<string, DoctrineFit>();
  it('is not-checked with no rule, no doctrineIds or no surviving doctrine', () => {
    expect(checkDoctrine(victim([]), undefined, none)).toEqual({ status: 'not-checked' });
    expect(checkDoctrine(victim([]), rule(), none)).toEqual({ status: 'not-checked' });
    expect(checkDoctrine(victim([]), rule([]), none)).toEqual({ status: 'not-checked' });
    expect(checkDoctrine(victim([]), rule(['gone']), none)).toEqual({ status: 'not-checked' });
  });
  it('matches an empty fit and records the doctrine name', () => {
    const docs = new Map([['a', fit('a')]]);
    expect(checkDoctrine(victim([]), rule(['a']), docs)).toEqual({
      status: 'matched',
      doctrineId: 'a',
      doctrineName: 'Fit a',
    });
  });
  it('flags off-doctrine with the nearest fit and its diff', () => {
    const docs = new Map([['a', fit('a', { modules: [HIGH] })]]);
    expect(checkDoctrine(victim([]), rule(['a']), docs)).toEqual({
      status: 'off-doctrine',
      doctrineId: 'a',
      doctrineName: 'Fit a',
      diff: { missingModules: [HIGH], extraModules: [], missingRigs: [], extraRigs: [] },
    });
  });
  it('ignores doctrines of another hull', () => {
    const docs = new Map([['a', fit('a', { hullTypeId: 1 })]]);
    expect(checkDoctrine(victim([]), rule(['a']), docs)).toEqual({ status: 'not-checked' });
  });
  it('counts a mutated module as one of its bases', () => {
    const base = muta.bases[0];
    const docs = new Map([['a', fit('a', { modules: [base] })]]);
    const res = checkDoctrine(victim([slotted(muta.result, MED_FLAG)]), rule(['a']), docs);
    expect(res.status).toBe('matched');
  });
});
