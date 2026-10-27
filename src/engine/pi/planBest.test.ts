import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { planGoals } from './goalPlan';
import type { PlannerColony, PlannerPolicy, PlanetType, PriceBooks } from './goalTypes';
import { pickBest, planBest, type CandidateScore } from './planBest';

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

function colony(planetId: number, planetType: PlanetType, rates: number[], cc = 5): PlannerColony {
  const row = pi.infrastructure.commandCenterUpgrades[cc];
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

  it('ranks a host that reaches the goals above one that nets more by making nothing', () => {
    // A CC0 Barren cannot carry even the Launchpad, so hosting there makes no
    // Coolant at all — its colonies just keep selling — while the gas colony
    // makes all of it. At a Coolant price under its inputs' worth, making
    // nothing nets more; the pilot asked for Coolant, so it still loses.
    const cheap = { ...prices, [COOLANT]: 8_000 };
    const best = planBest(
      {
        goals: [{ typeId: COOLANT, unitsPerDay: 120 }],
        colonies: [
          colony(1, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS]),
          colony(2, 'barren', [CARBON_COMPOUNDS], 0),
        ],
        policy: POLICY,
        books: { bid: cheap, ask: cheap, salesTaxPct: 4 },
      },
      pi
    );
    expect(best.plan.factoryHost?.planetId).toBe(1);
    expect(best.plan.achieved[0].fraction).toBeCloseTo(1);
  });

  it('orders candidates by attainment, shortfalls, haul among near-best nets, then net, forfeit, id', () => {
    const base = {
      attainment: 1,
      shortfalls: 0,
      net: 100_000,
      changes: 2,
      haul: 50,
      unknownLegs: 0,
      forfeit: 10,
      planetId: 5,
    };
    const pick = (xs: CandidateScore[]) => pickBest(xs, 0).planetId;
    // Most of the goal at a lower net beats less of it at a higher one.
    expect(pick([{ ...base, attainment: 0.6, net: 900_000, planetId: 1 }, base])).toBe(5);
    expect(pick([{ ...base, shortfalls: 1, net: 900_000, planetId: 1 }, base])).toBe(5);
    // Within 5% of the best net (here 5,000 of 100,000), the shorter haul wins...
    expect(pick([{ ...base, net: 96_000, haul: 10, planetId: 1 }, base])).toBe(1);
    // ...but not beyond it.
    expect(pick([{ ...base, net: 94_000, haul: 10, planetId: 1 }, base])).toBe(5);
    expect(pick([{ ...base, net: 99_000, planetId: 1 }, base])).toBe(5);
    expect(pick([{ ...base, forfeit: 20, planetId: 1 }, base])).toBe(5);
    // Within the tolerance, touching fewer colonies beats hauling less.
    expect(pick([{ ...base, net: 97_000, changes: 1, haul: 900, planetId: 1 }, base])).toBe(1);
    expect(pick([base, { ...base, planetId: 1 }])).toBe(1);
  });

  it('never lets an unknown distance pass for a short haul', () => {
    const base = {
      attainment: 1,
      shortfalls: 0,
      changes: 0,
      forfeit: 0,
    };
    // Haul 0 only because two legs have no distance yet: the known 7.5 wins.
    const unknown = { ...base, net: 96_000, haul: 0, unknownLegs: 2, planetId: 1 };
    const known = { ...base, net: 100_000, haul: 7.5, unknownLegs: 0, planetId: 2 };
    expect(pickBest([unknown, known], 0).planetId).toBe(2);
    // Equally unknown: haul is not compared, so net decides.
    expect(pickBest([unknown, { ...known, unknownLegs: 2, haul: 900 }], 0).planetId).toBe(2);
  });

  it('takes the 5% from the Baseline when it is the larger figure', () => {
    const base = {
      attainment: 1,
      shortfalls: 0,
      net: 1_000,
      changes: 0,
      haul: 50,
      unknownLegs: 0,
      forfeit: 0,
      planetId: 5,
    };
    // Nets of 1,000 vs 600 are 400 apart: beyond 5% of 1,000 (and the 100
    // ISK/h floor), within 5% of a 100,000 Baseline.
    expect(pickBest([{ ...base, net: 600, haul: 1, planetId: 1 }, base], 0).planetId).toBe(5);
    expect(pickBest([{ ...base, net: 600, haul: 1, planetId: 1 }, base], 100_000).planetId).toBe(1);
  });

  it('hosts on a nearby self-supplying colony over a 28-jump one when their nets are close', () => {
    // Two gas colonies that each make Coolant from their own P0. The far one
    // nets a little more (lower customs); the near one hauls far less.
    const far = { ...colony(1, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS]), taxRate: 0.1 };
    const near = { ...colony(2, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS]), taxRate: 0.11 };
    // P1 bids under their own export customs: neither colony has a Baseline to sell.
    const thin = { [ELECTROLYTES]: 30, [WATER]: 30, [COOLANT]: 40_000 };
    const input = {
      goals: [{ typeId: COOLANT, unitsPerDay: 5 * 24 }],
      colonies: [far, near],
      policy: POLICY,
      books: { bid: thin, ask: thin, salesTaxPct: 4 },
    };
    expect(planBest(input, pi).plan.factoryHost?.planetId).toBe(1);

    const jumps = (from: number, to: number | 'hub') =>
      to === 'hub' ? (from === 1 ? 28 : 2) : from === to ? 0 : 30;
    const best = planBest({ ...input, jumps }, pi);
    expect(best.plan.factoryHost?.planetId).toBe(2);
    expect(best.plan.flows).toContainEqual(
      expect.objectContaining({ from: 2, to: 'hub', typeId: COOLANT, jumps: 2 })
    );
    // 5 Coolant/h at 0.75 m3, 2 jumps; the host feeding itself moves nothing.
    expect(best.plan.haulEffort).toEqual({
      m3JumpsPerHour: expect.closeTo(5 * 0.75 * 2, 6),
      unknownLegs: 0,
    });
  });

  it('counts legs with no known distance instead of guessing them', () => {
    const best = planBest(
      {
        goals: [{ typeId: COOLANT, unitsPerDay: 5 * 24 }],
        colonies: [colony(1, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS])],
        policy: POLICY,
        books: BOOKS,
        jumps: () => null,
      },
      pi
    );
    expect(best.plan.haulEffort).toEqual({ m3JumpsPerHour: 0, unknownLegs: 1 });
    expect(best.plan.flows.find((f) => f.to === 'hub')?.jumps).toBeNull();
    expect(best.baseline.haulEffort.unknownLegs).toBeGreaterThan(0);
  });
});
