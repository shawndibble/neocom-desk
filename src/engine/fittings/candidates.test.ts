import { describe, expect, it } from 'vitest';
import {
  classifyRuleBreaks,
  groupsHoldingRack,
  searchCandidates,
  type CandidateEntry,
} from './candidates';

const entries: CandidateEntry[] = [
  { typeId: 1, name: 'Damage Control I', marketGroupId: 10 },
  { typeId: 2, name: 'Damage Control II', marketGroupId: 10 },
  { typeId: 3, name: '1MN Afterburner II', marketGroupId: 20 },
  { typeId: 4, name: 'Hobgoblin I', marketGroupId: 30 },
  { typeId: 5, name: 'EMP S', marketGroupId: 40 },
];
const rackOf: Record<string, 'low' | 'medium' | 'drone'> = {
  1: 'low',
  2: 'low',
  3: 'medium',
  4: 'drone',
};
const metaOf: Record<number, number> = { 1: 1, 2: 2, 3: 2 };

describe('searchCandidates', () => {
  const baseOptions = {
    query: '',
    rack: null,
    rackOf,
    groupIds: null,
    metaGroupId: null,
    metaGroupOf: (typeId: number) => metaOf[typeId] ?? null,
  };

  it('only ever offers fittable things (a rack, or a drone), never ammo or anything else', () => {
    expect(searchCandidates(entries, baseOptions).map((e) => e.typeId)).toEqual([3, 1, 2, 4]);
  });

  it('sorts by name and matches the query case-insensitively on any part of the name', () => {
    expect(
      searchCandidates(entries, { ...baseOptions, query: 'control' }).map((e) => e.typeId)
    ).toEqual([1, 2]);
  });

  it('narrows to one rack when "fits this slot" is on', () => {
    expect(
      searchCandidates(entries, { ...baseOptions, rack: 'medium' }).map((e) => e.typeId)
    ).toEqual([3]);
  });

  it('narrows to the chosen market groups and meta group', () => {
    expect(
      searchCandidates(entries, { ...baseOptions, groupIds: new Set([10]) }).map((e) => e.typeId)
    ).toEqual([1, 2]);
    expect(
      searchCandidates(entries, { ...baseOptions, metaGroupId: 2 }).map((e) => e.typeId)
    ).toEqual([3, 2]);
  });

  it('caps the result count', () => {
    expect(searchCandidates(entries, baseOptions, 2)).toHaveLength(2);
  });
});

describe('groupsHoldingRack', () => {
  const parentOf = new Map<number, number | null>([
    [1, null],
    [5, 1],
    [10, 5],
    [20, 5],
    [30, 1],
  ]);

  it('is every group holding an item of that rack, plus their ancestors', () => {
    expect([...groupsHoldingRack(entries, 'low', rackOf, parentOf)].sort((a, b) => a - b)).toEqual([
      1, 5, 10,
    ]);
  });

  it('with no rack, covers every fittable item', () => {
    expect([...groupsHoldingRack(entries, null, rackOf, parentOf)].sort((a, b) => a - b)).toEqual([
      1, 5, 10, 20, 30,
    ]);
  });
});

describe('classifyRuleBreaks', () => {
  it('passes an item that only overflows a resource', () => {
    expect(classifyRuleBreaks(['resource'])).toEqual({ fitsHull: true, canFly: true });
  });

  it('flags a skill shortfall as not flyable, but still fitting the hull', () => {
    expect(classifyRuleBreaks(['skill', 'resource'])).toEqual({ fitsHull: true, canFly: false });
  });

  it.each(['wrong_slot', 'slots', 'rig_size', 'ship_restricted', 'capital_item', 'max_group'])(
    'treats %s as not fitting the hull',
    (rule) => {
      expect(classifyRuleBreaks([rule]).fitsHull).toBe(false);
    }
  );
});
