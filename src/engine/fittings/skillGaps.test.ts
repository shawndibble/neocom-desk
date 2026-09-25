import { describe, expect, it } from 'vitest';
import { computeSkillGaps, firstResourceOverage, resourceOverage } from './skillGaps';
import type { Fitting, FittingStats } from './types';

const fitting: Fitting = {
  name: 'Test',
  shipTypeId: 1,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 10, state: 'active', chargeTypeId: 30 },
    { slot: 'low', slotIndex: 0, typeId: 11, state: 'online' },
  ],
  drones: [{ typeId: 40, quantity: 2, state: 'active' }],
  cargo: [],
};

const requirements = new Map([
  [1, [{ skillTypeID: 100, level: 3 }]],
  [10, [{ skillTypeID: 200, level: 4 }]],
  [11, [{ skillTypeID: 200, level: 2 }]],
  [30, [{ skillTypeID: 300, level: 1 }]],
  [40, [{ skillTypeID: 100, level: 5 }]],
]);

describe('resourceOverage', () => {
  it('is the amount above the total', () => {
    expect(resourceOverage(112.5, 100)).toBeCloseTo(12.5);
  });
  it('is 0 at or under budget and when unknown', () => {
    expect(resourceOverage(100, 100)).toBe(0);
    expect(resourceOverage(50, 100)).toBe(0);
    expect(resourceOverage(null, 100)).toBe(0);
    expect(resourceOverage(10, null)).toBe(0);
  });
});

describe('firstResourceOverage', () => {
  const within = {
    cpuUsed: 50,
    cpuTotal: 100,
    powergridUsed: 50,
    powergridTotal: 100,
    calibrationUsed: 0,
    calibrationTotal: 400,
  } as FittingStats;

  it('is null when every budget holds', () => {
    expect(firstResourceOverage(within)).toBeNull();
  });

  it('names the resource and amount it is over on', () => {
    expect(firstResourceOverage({ ...within, cpuUsed: 202 })).toEqual({
      resource: 'cpu',
      amount: 102,
    });
    expect(firstResourceOverage({ ...within, calibrationUsed: 450 })).toEqual({
      resource: 'calibration',
      amount: 50,
    });
  });
});

describe('computeSkillGaps', () => {
  it('marks only modules whose own requirements exceed the pilot', () => {
    const gaps = computeSkillGaps(fitting, requirements, new Map([[200, 3]]));
    expect([...gaps.unusableModuleKeys]).toEqual(['high-0']);
  });

  it('takes the highest required level per skill across hull, modules, charges and drones', () => {
    const gaps = computeSkillGaps(fitting, requirements, new Map());
    expect(gaps.missing).toEqual(
      expect.arrayContaining([
        { skillTypeID: 100, targetLevel: 5 },
        { skillTypeID: 200, targetLevel: 4 },
        { skillTypeID: 300, targetLevel: 1 },
      ])
    );
    expect(gaps.missing).toHaveLength(3);
  });

  it('omits skills the pilot already meets', () => {
    const gaps = computeSkillGaps(
      fitting,
      requirements,
      new Map([
        [100, 5],
        [200, 4],
        [300, 1],
      ])
    );
    expect(gaps.missing).toEqual([]);
    expect(gaps.unusableModuleKeys.size).toBe(0);
  });
});
