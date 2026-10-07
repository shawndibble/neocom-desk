import { describe, expect, it } from 'vitest';
import type { AccountGroup, AccountPlan } from '@/engine/pi/accountPlan';
import { accountView } from './accountPlanModel';

const group = (
  planetIds: number[],
  typeId: number | null,
  apart: number,
  isk: number
): AccountGroup => ({
  typeId,
  planetIds,
  iskPerDay: isk,
  apartPerDay: apart,
  gainPerDay: isk - apart,
  unitsPerDay: 0,
  hostId: typeId === null ? null : planetIds[0],
  m3PerWeek: 0,
  legs: [],
  buys: false,
});

const plan = (groups: AccountGroup[]): AccountPlan => ({
  groups,
  totalPerDay: groups.reduce((sum, g) => sum + g.iskPerDay, 0),
  apartTotalPerDay: groups.reduce((sum, g) => sum + g.apartPerDay, 0),
  buyGainPerDay: 0,
  haulGainPerDay: 0,
  unknownPlanetIds: [],
});

describe('accountView', () => {
  it('lists chains that gain, biggest gain first, and leaves the rest staying put', () => {
    const view = accountView(
      plan([
        group([1, 2], 100, 1_000_000, 1_500_000),
        group([3], null, 400_000, 400_000),
        group([4, 5], 200, 1_000_000, 3_000_000),
      ])
    );
    expect(view.changes.map((g) => g.typeId)).toEqual([200, 100]);
    expect(view.stays.map((g) => g.planetIds)).toEqual([[3]]);
  });

  it('treats a gain inside the solver tolerance as the same plan', () => {
    const view = accountView(plan([group([1, 2], 100, 1_000_000, 1_020_000)]));
    expect(view.changes).toEqual([]);
    expect(view.stays).toHaveLength(1);
  });
});
