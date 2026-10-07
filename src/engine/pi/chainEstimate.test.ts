import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from './chain';
import { estimateChain, reachesInFull } from './chainEstimate';
import type { PlannerColony, PlannerPolicy, PlanetType, PriceBooks } from './goalTypes';
import { planBest } from './planBest';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const AQUEOUS_LIQUIDS = 2268;
const IONIC_SOLUTIONS = 2309;
const COOLANT = 9832;

const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};

function priced(): PriceBooks {
  const book: Record<number, number> = {};
  const byTier: Record<number, number> = { 0: 5, 1: 400, 2: 8_000, 3: 60_000, 4: 1_000_000 };
  for (const raw of pi.raw) book[raw.typeID] = 5;
  for (const key of Object.keys(pi.schematics)) {
    book[Number(key)] = byTier[piTier(Number(key), pi)];
  }
  return { ask: book, bid: book, salesTaxPct: 4 };
}

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

// Coolant (P2) from one Gas planet: Ionic Solutions and Aqueous Liquids.
const GAS = [colony(1, 'gas', [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS])];

describe('estimateChain', () => {
  it('finds the most a set of colonies makes in full, and prices that plan', () => {
    const books = priced();
    const result = estimateChain({ typeId: COOLANT, colonies: GAS, policy: POLICY, books }, pi);
    if (result.status !== 'estimated') throw new Error(`expected estimated, got ${result.status}`);
    expect(result.unitsPerDay).toBeGreaterThan(0);
    // Every goal is reached in full at that rate…
    const at = planBest(
      {
        goals: [{ typeId: COOLANT, unitsPerDay: result.unitsPerDay }],
        colonies: GAS,
        policy: POLICY,
        books,
      },
      pi
    );
    expect(reachesInFull(at.plan)).toBe(true);
    // …and a tenth more is not: the colonies are the limit, not the search.
    const above = planBest(
      {
        goals: [{ typeId: COOLANT, unitsPerDay: result.unitsPerDay * 1.1 }],
        colonies: GAS,
        policy: POLICY,
        books,
      },
      pi
    );
    expect(reachesInFull(above.plan)).toBe(false);
    // The figure is the plan's absolute net a day, never a lift over a Baseline.
    expect(at.economics.status).toBe('costed');
    if (at.economics.status !== 'costed') return;
    expect(result.iskPerDay).toBeCloseTo(at.economics.netPerHour * 24, 0);
    expect(result.m3PerWeek).toBeCloseTo(at.plan.hauling.m3PerWeek, 6);
    expect(result.best.plan.factoryHost?.planetId).toBe(1);
  });

  it('hands a jumps function to the planner, so every leg between colonies carries its distance', () => {
    // Condensates (P3) from two Gas colonies: one ships its P1 to the other.
    const GAS_RAWS = [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS, 2311, 2310];
    const colonies = [colony(1, 'gas', GAS_RAWS), colony(2, 'gas', GAS_RAWS)];
    const result = estimateChain(
      {
        typeId: 2344,
        colonies,
        policy: POLICY,
        books: priced(),
        jumps: (from, to) => (to === 'hub' ? 9 : from === to ? 0 : 3),
      },
      pi
    );
    if (result.status !== 'estimated') throw new Error(`expected estimated, got ${result.status}`);
    const between = result.best.plan.flows.filter(
      (f) => f.from !== 'hub' && f.to !== 'hub' && f.from !== f.to
    );
    expect(between.length).toBeGreaterThan(0);
    expect(between.every((f) => f.jumps === 3)).toBe(true);
  });

  it('refuses with the missing prices rather than pricing them at zero', () => {
    const books = priced();
    const bid = { ...books.bid };
    delete bid[COOLANT];
    const result = estimateChain(
      { typeId: COOLANT, colonies: GAS, policy: POLICY, books: { ...books, bid } },
      pi
    );
    expect(result).toEqual({ status: 'needs-price', missing: [COOLANT] });
  });

  it('refuses when the colonies cannot make it at any rate', () => {
    // A Barren planet yields neither of Coolant's raws.
    const result = estimateChain(
      { typeId: COOLANT, colonies: [colony(1, 'barren', [])], policy: POLICY, books: priced() },
      pi
    );
    expect(result).toEqual({ status: 'no-plan' });
  });

  it('never buys its way to a figure, whatever the policy says', () => {
    // With P1 bought at the hub a lone Barren could "make" Coolant: a trade
    // spread, not a planet chain.
    const result = estimateChain(
      {
        typeId: COOLANT,
        colonies: [colony(1, 'barren', [])],
        policy: { ...POLICY, buyTiers: [1, 2] },
        books: priced(),
      },
      pi
    );
    expect(result).toEqual({ status: 'no-plan' });
  });
});
