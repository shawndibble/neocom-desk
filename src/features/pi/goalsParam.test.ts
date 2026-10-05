import { describe, it, expect } from 'vitest';
import {
  goalsParam,
  idListParam,
  parseGoals,
  plannableGoals,
  seedGoal,
  serializeGoals,
  DEFAULT_GOAL_PER_DAY,
} from './goalsParam';

describe('parseGoals', () => {
  it('reads typeId:perDay pairs in order', () => {
    expect(parseGoals('2867:3,9840:120')).toEqual([
      { typeId: 2867, unitsPerDay: 3 },
      { typeId: 9840, unitsPerDay: 120 },
    ]);
  });

  it('reads decimals and a zero rate (a goal being typed is still a goal)', () => {
    expect(parseGoals('2867:0.5,9840:0')).toEqual([
      { typeId: 2867, unitsPerDay: 0.5 },
      { typeId: 9840, unitsPerDay: 0 },
    ]);
  });

  it('drops malformed pairs rather than failing the whole list', () => {
    expect(parseGoals('abc,2867:3,:4,9840:,-1:5,12:-3,13:NaN,14:Infinity,1.5:2,9840:7')).toEqual([
      { typeId: 2867, unitsPerDay: 3 },
      { typeId: 9840, unitsPerDay: 7 },
    ]);
  });

  it('merges a repeated type into one goal, summing the rates, at its first position', () => {
    expect(parseGoals('9840:2,2867:3,9840:5')).toEqual([
      { typeId: 9840, unitsPerDay: 7 },
      { typeId: 2867, unitsPerDay: 3 },
    ]);
  });

  it('reads an absent or empty param as no goals', () => {
    expect(parseGoals(null)).toEqual([]);
    expect(parseGoals('')).toEqual([]);
  });
});

describe('serializeGoals', () => {
  it('round-trips through parseGoals', () => {
    const goals = [
      { typeId: 2867, unitsPerDay: 3 },
      { typeId: 9840, unitsPerDay: 0.25 },
    ];
    expect(parseGoals(serializeGoals(goals))).toEqual(goals);
  });

  it('removes the key when there are no goals', () => {
    expect(serializeGoals([])).toBeNull();
  });
});

describe('goalsParam', () => {
  it('debounces, since the rate is typed', () => {
    expect(goalsParam().debounceMs).toBeGreaterThan(0);
  });
});

describe('plannableGoals', () => {
  it('keeps only types the planner can plan, so a P0 or a stray id never reaches the solver', () => {
    const plannable = new Set([2867]);
    expect(
      plannableGoals(
        [
          { typeId: 2867, unitsPerDay: 3 },
          { typeId: 2268, unitsPerDay: 9 },
        ],
        plannable
      )
    ).toEqual([{ typeId: 2867, unitsPerDay: 3 }]);
  });
});

describe('seedGoal', () => {
  it('adds the deep-linked type as a goal at the default rate', () => {
    expect(seedGoal([{ typeId: 9840, unitsPerDay: 2 }], 2867)).toEqual([
      { typeId: 9840, unitsPerDay: 2 },
      { typeId: 2867, unitsPerDay: DEFAULT_GOAL_PER_DAY },
    ]);
  });

  it('leaves an existing goal for that type alone', () => {
    const goals = [{ typeId: 2867, unitsPerDay: 2 }];
    expect(seedGoal(goals, 2867)).toBe(goals);
  });
});

describe('idListParam', () => {
  it('round-trips a sorted, de-duplicated id list and drops junk', () => {
    const codec = idListParam();
    expect(codec.parse('3,1,x,1,-2,2.5')).toEqual([1, 3]);
    expect(codec.parse(null)).toEqual([]);
    expect(codec.serialize([3, 1])).toBe('1,3');
    expect(codec.serialize([])).toBeNull();
  });
});
