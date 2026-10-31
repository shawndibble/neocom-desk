import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AccountGroup, AccountPlan } from '@/engine/pi/accountPlan';
import { piTier } from '@/engine/pi/chain';
import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import type { PiData } from '@/sde/types';
import { accountCandidates, accountView } from './accountPlanModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

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
  thin: null,
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
  it('lists every product group, biggest gain first, and leaves the rest staying put', () => {
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
});

describe('accountCandidates', () => {
  const planet = (planetType: PlanetType): PlannerColony =>
    ({ planetId: 1, planetType, ratePerEcu: new Map() }) as unknown as PlannerColony;
  const colonies = (
    ['barren', 'gas', 'ice', 'lava', 'oceanic', 'plasma', 'storm', 'temperate'] as const
  ).map(planet);
  // Buying makes every host-able product a candidate, so the pool is every priced P4.
  const p4 = Object.keys(pi.schematics)
    .map(Number)
    .filter((id) => piTier(id, pi) === 4);
  const prices = Object.fromEntries(p4.map((id, i) => [id, 1_000_000 + i * 1000]));
  const dearest = p4[p4.length - 1];

  it('ranks by price alone when no volume is known', () => {
    const picks = accountCandidates(colonies, pi, prices, true).filter((id) => p4.includes(id));
    expect(picks[0]).toBe(dearest);
  });

  it('ranks a thin high-price P4 below a liquid lower-price one', () => {
    const trades = new Map(p4.map((id) => [id, 500]));
    trades.set(dearest, 1);
    const picks = accountCandidates(colonies, pi, prices, true, trades).filter((id) =>
      p4.includes(id)
    );
    expect(picks[0]).toBe(p4[p4.length - 2]);
    expect(picks.indexOf(dearest)).toBe(-1);
  });

  it('does not penalise a product whose volume is missing from a partial map', () => {
    const trades = new Map([[p4[0], 500]]);
    const picks = accountCandidates(colonies, pi, prices, true, trades).filter((id) =>
      p4.includes(id)
    );
    expect(picks[0]).toBe(dearest);
  });
});
