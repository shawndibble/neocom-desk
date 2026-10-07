import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from './chain';
import { planAccount, type AccountPlan, type AccountPlanInput } from './accountPlan';
import type { PlannerColony, PlannerPolicy, PlanetType, PriceBooks } from './goalTypes';
import type { PiTier } from './types';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const AQUEOUS_LIQUIDS = 2268;
const IONIC_SOLUTIONS = 2309;
const COOLANT = 9832;
const CONDENSATES = 2344;
const GAS_RAWS = [IONIC_SOLUTIONS, AQUEOUS_LIQUIDS, 2311, 2310];

const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};

function priced(overrides: Record<number, number> = {}): PriceBooks {
  const book: Record<number, number> = {};
  const byTier: Record<number, number> = { 0: 5, 1: 400, 2: 8_000, 3: 60_000, 4: 1_000_000 };
  for (const raw of pi.raw) book[raw.typeID] = 5;
  for (const key of Object.keys(pi.schematics)) {
    book[Number(key)] = byTier[piTier(Number(key), pi)];
  }
  Object.assign(book, overrides);
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

function run(input: Partial<AccountPlanInput> & Pick<AccountPlanInput, 'colonies'>): AccountPlan {
  const steps = planAccount({
    policy: POLICY,
    books: priced(),
    haul: false,
    candidates: [COOLANT, CONDENSATES],
    pi,
    ...input,
  });
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

describe('planAccount', () => {
  it('with no haul and no buying, every colony stays on its own best pick', () => {
    const colonies = [colony(1, 'gas', GAS_RAWS), colony(2, 'gas', GAS_RAWS)];
    const plan = run({ colonies });
    expect(plan.groups.every((g) => g.planetIds.length === 1)).toBe(true);
    expect(plan.groups.map((g) => g.planetIds[0]).sort()).toEqual([1, 2]);
    expect(plan.totalPerDay).toBeCloseTo(
      plan.groups.reduce((sum, g) => sum + g.iskPerDay, 0),
      6
    );
  });

  it('with haul on, joins colonies into one chain when it out-earns them apart', () => {
    const colonies = [colony(1, 'gas', GAS_RAWS), colony(2, 'gas', GAS_RAWS)];
    const alone = run({ colonies });
    const joined = run({ colonies, haul: true, books: priced({ [CONDENSATES]: 5_000_000 }) });
    const chain = joined.groups.find((g) => g.typeId === CONDENSATES);
    expect(chain).toBeDefined();
    expect(chain!.planetIds.length).toBe(2);
    expect(chain!.gainPerDay).toBeGreaterThan(0);
    expect(joined.totalPerDay).toBeGreaterThan(alone.totalPerDay);
    expect(joined.haulGainPerDay).toBeGreaterThan(0);
  });

  it('never takes a chain that does not beat its colonies apart', () => {
    const colonies = [colony(1, 'gas', GAS_RAWS), colony(2, 'gas', GAS_RAWS)];
    const candidates = [CONDENSATES];
    const alone = run({ colonies, candidates });
    const joined = run({ colonies, candidates, haul: true, books: priced({ [CONDENSATES]: 1 }) });
    expect(joined.groups.every((g) => g.typeId === null)).toBe(true);
    expect(joined.totalPerDay).toBeCloseTo(alone.totalPerDay, 6);
  });

  it('leaves a colony the chain does not use on its own pick, and does not count it in the gain', () => {
    const colonies = [
      colony(1, 'gas', GAS_RAWS),
      colony(2, 'gas', GAS_RAWS),
      colony(3, 'gas', GAS_RAWS),
    ];
    const joined = run({
      colonies,
      haul: true,
      candidates: [COOLANT],
      books: priced({ [COOLANT]: 5_000_000 }),
    });
    const used = joined.groups.flatMap((g) => g.planetIds);
    expect([...used].sort()).toEqual([1, 2, 3]);
    // A chain's gain is its own colonies' figure less what they make apart, never the whole account's.
    for (const g of joined.groups.filter((g) => g.typeId !== null)) {
      expect(g.gainPerDay).toBeGreaterThan(0);
    }
  });

  it('with a buy tier, one colony runs a product from bought inputs', () => {
    const colonies = [colony(1, 'barren', [])];
    const none = run({ colonies, candidates: [COOLANT] });
    const buying = run({
      colonies,
      candidates: [COOLANT],
      policy: { ...POLICY, buyTiers: [1] as PiTier[] },
      books: priced({ [COOLANT]: 5_000_000 }),
    });
    expect(none.groups.every((g) => g.typeId === null)).toBe(true);
    const chain = buying.groups.find((g) => g.typeId === COOLANT);
    expect(chain?.planetIds).toEqual([1]);
    expect(buying.buyGainPerDay).toBeGreaterThan(0);
  });
});
