import { describe, expect, it } from 'vitest';
import {
  MAX_SHARED_PLAN_ENTRIES,
  decodePlanEntries,
  encodePlanEntries,
  parseSharedPlanId,
  planSyncActions,
  sharedPlanId,
} from './sharedPlans';

describe('encodePlanEntries / decodePlanEntries', () => {
  it('round-trips skill, level and priority as flat triples (Firestore has no nested arrays)', () => {
    const entries = [
      { skillTypeID: 3300, targetLevel: 5 },
      { skillTypeID: 3301, targetLevel: 3, priority: 'high' as const },
      { skillTypeID: 3302, targetLevel: 1, priority: 'low' as const },
    ];
    const flat = encodePlanEntries(entries);
    expect(flat).toEqual([3300, 5, 1, 3301, 3, 2, 3302, 1, 0]);
    expect(decodePlanEntries(flat)).toEqual([
      { skillTypeID: 3300, targetLevel: 5 },
      { skillTypeID: 3301, targetLevel: 3, priority: 'high' },
      { skillTypeID: 3302, targetLevel: 1, priority: 'low' },
    ]);
  });

  it('keeps an empty plan', () => {
    expect(encodePlanEntries([])).toEqual([]);
    expect(decodePlanEntries([])).toEqual([]);
  });

  it('refuses a plan past the entry cap, and one with a level outside 1 to 5', () => {
    const many = Array.from({ length: MAX_SHARED_PLAN_ENTRIES + 1 }, (_, i) => ({
      skillTypeID: i + 1,
      targetLevel: 1,
    }));
    expect(encodePlanEntries(many)).toBeNull();
    expect(encodePlanEntries([{ skillTypeID: 1, targetLevel: 6 }])).toBeNull();
    expect(encodePlanEntries([{ skillTypeID: 1, targetLevel: 0 }])).toBeNull();
  });
});

describe('decodePlanEntries on what another device wrote', () => {
  it.each([
    ['not an array', 'nope'],
    ['not a multiple of three', [1, 2]],
    ['a non-integer', [1.5, 2, 1]],
    ['a level of 9', [1, 9, 1]],
    ['an unknown priority', [1, 2, 7]],
    ['a string among the numbers', [1, '2', 1]],
  ])('rejects %s', (_label, value) => {
    expect(decodePlanEntries(value)).toBeNull();
  });
});

describe('shared plan ids', () => {
  it('binds the owner to the id and parses it back', () => {
    const id = sharedPlanId('char:7', 'abc-123');
    expect(id).toBe('char:7~abc-123');
    expect(parseSharedPlanId(id)).toEqual({ ownerUid: 'char:7', planId: 'abc-123' });
  });

  it('rejects an id with no owner half or with an unsafe plan id', () => {
    expect(parseSharedPlanId('abc')).toBeNull();
    expect(parseSharedPlanId('char:7~a/b')).toBeNull();
    expect(parseSharedPlanId('char:7~')).toBeNull();
  });
});

describe('planSyncActions', () => {
  it('pushes a shared plan edited since it was shared, and leaves a current one alone', () => {
    const actions = planSyncActions(
      [
        { id: 'a', updatedAt: 200 },
        { id: 'b', updatedAt: 100 },
      ],
      new Map([
        ['a', 100],
        ['b', 100],
      ])
    );
    expect(actions).toEqual({ push: ['a'], remove: [] });
  });

  it('removes the shared copy of a plan that no longer exists', () => {
    expect(
      planSyncActions(
        [{ id: 'a', updatedAt: 1 }],
        new Map([
          ['a', 1],
          ['gone', 1],
        ])
      )
    ).toEqual({
      push: [],
      remove: ['gone'],
    });
  });

  it('never shares a plan that was not shared already', () => {
    expect(planSyncActions([{ id: 'a', updatedAt: 9 }], new Map())).toEqual({
      push: [],
      remove: [],
    });
  });
});
