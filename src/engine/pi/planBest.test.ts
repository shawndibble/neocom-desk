import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { planGoals } from './goalPlan';
import type { PlannerColony, PlannerPolicy, PlanetType, PriceBooks } from './goalTypes';
import { planBest } from './planBest';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const AQUEOUS_LIQUIDS = 2268;
const CARBON_COMPOUNDS = 2288;
const IONIC_SOLUTIONS = 2309;
const ELECTROLYTES = 2390;
const BIOFUELS = 2396;
const WATER = 3645;
const COOLANT = 9832;

const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};

const prices = { [ELECTROLYTES]: 600, [WATER]: 700, [BIOFUELS]: 300, [COOLANT]: 40_000 };
const BOOKS: PriceBooks = { bid: prices, ask: prices, salesTaxPct: 4 };

function colony(planetId: number, planetType: PlanetType, rates: number[]): PlannerColony {
  const row = pi.infrastructure.commandCenterUpgrades[5];
  return {
    planetId,
    planetType,
    budget: { cpu: row.cpu, powergrid: row.powergrid },
    newLinkCost: { cpu: 15, powergrid: 10 },
    headsPerExtractor: 4,
    taxRate: 0.1,
    ratePerEcu: new Map(
      rates.map((id) => [id, { unitsPerHour: 6000, source: 'assumed' as const }])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

describe('planBest', () => {
  it('hosts on the colony that supplies itself when that nets more than the scarce-score pick', () => {
    // Gas yields both of Coolant's P0s; the Barren yields neither, so the
    // scarcity score alone would host on the Barren and ship every P1 in.
    const colonies = [
      colony(1, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS]),
      colony(2, 'barren', [CARBON_COMPOUNDS]),
    ];
    const input = {
      goals: [{ typeId: COOLANT, unitsPerDay: 5 * 24 }],
      colonies,
      policy: POLICY,
      books: BOOKS,
    };
    expect(planGoals(input, pi).factoryHost?.planetId).toBe(2);

    const best = planBest(input, pi);
    expect(best.plan.factoryHost).toEqual({ planetId: 1, reason: 'best-net' });
    const forcedOther = planBest({ ...input, colonies: [colonies[1], colonies[0]] }, pi);
    expect(forcedOther.plan.factoryHost?.planetId).toBe(1);
    if (best.economics.status !== 'costed') throw new Error(best.economics.status);
    expect(best.economics.customs.importToHost).toBe(0);
  });

  it('can force a host, and refuses one that cannot carry the factories', () => {
    const colonies = [
      colony(1, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS]),
      colony(2, 'barren', [CARBON_COMPOUNDS]),
    ];
    const input = {
      goals: [{ typeId: COOLANT, unitsPerDay: 5 * 24 }],
      colonies,
      policy: POLICY,
      books: BOOKS,
    };
    expect(planGoals({ ...input, hostPlanetId: 1 }, pi).factoryHost).toEqual({
      planetId: 1,
      reason: 'forced',
    });
    expect(() => planGoals({ ...input, hostPlanetId: 99 }, pi)).toThrow();
  });

  it('names the only eligible host as such', () => {
    const best = planBest(
      {
        goals: [{ typeId: COOLANT, unitsPerDay: 5 * 24 }],
        colonies: [colony(1, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS])],
        policy: POLICY,
        books: BOOKS,
      },
      pi
    );
    expect(best.plan.factoryHost).toEqual({ planetId: 1, reason: 'only-eligible' });
  });
});
