import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { baselineTotal } from './baseline';
import { planGoals } from './goalPlan';
import type { Goal, PlannerColony, PlannerPolicy, PlanetType, PriceBooks } from './goalTypes';
import { planEconomics } from './planEconomics';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BASE_METALS = 2267;
const NOBLE_METALS = 2270;
const REACTIVE_METALS = 2398;
const PRECIOUS_METALS = 2399;
const ELECTROLYTES = 2390;
const WATER = 3645;
const COOLANT = 9832;
const AQUEOUS_LIQUIDS = 2268;
const IONIC_SOLUTIONS = 2309;
const CARBON_COMPOUNDS = 2288;
const BIOFUELS = 2396;

const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};
const ONE_ECU: PlannerPolicy = { ...POLICY, maxEcusPerColony: 1, maxP0TypesPerColony: 1 };

const BOOKS: PriceBooks = {
  bid: {
    [REACTIVE_METALS]: 500,
    [PRECIOUS_METALS]: 900,
    [ELECTROLYTES]: 600,
    [WATER]: 700,
    [COOLANT]: 20_000,
    [BIOFUELS]: 300,
  },
  ask: {
    [REACTIVE_METALS]: 550,
    [PRECIOUS_METALS]: 1000,
    [ELECTROLYTES]: 650,
    [WATER]: 750,
    [COOLANT]: 22_000,
    [BIOFUELS]: 320,
  },
  salesTaxPct: 4,
};

function colony(
  planetId: number,
  planetType: PlanetType,
  opts: { taxRate?: number; rates?: number[] } = {}
): PlannerColony {
  const row = pi.infrastructure.commandCenterUpgrades[5];
  const p0s =
    opts.rates ?? pi.raw.filter((r) => r.planetTypes.includes(planetType)).map((r) => r.typeID);
  return {
    planetId,
    planetType,
    budget: { cpu: row.cpu, powergrid: row.powergrid },
    newLinkCost: { cpu: 15, powergrid: 10 },
    headsPerExtractor: 10,
    taxRate: opts.taxRate ?? 0.1,
    ratePerEcu: new Map(p0s.map((id) => [id, { unitsPerHour: 6000, source: 'assumed' as const }])),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

function cost(
  goals: Goal[],
  colonies: PlannerColony[],
  policy: PlannerPolicy = POLICY,
  books = BOOKS
) {
  const plan = planGoals({ goals, colonies, policy, books }, pi);
  const baseline = baselineTotal(colonies, pi, policy, books);
  return { plan, baseline, economics: planEconomics(plan, colonies, baseline, books) };
}

/**
 * Each P1 Coolant needs comes off one colony; the temperate one yields only
 * Biofuels, which Coolant does not need, so it is the host.
 */
function coolantColonies(hostTax: number): PlannerColony[] {
  return [
    colony(1, 'gas', { rates: [IONIC_SOLUTIONS] }),
    colony(2, 'storm', { rates: [AQUEOUS_LIQUIDS] }),
    colony(3, 'temperate', { rates: [CARBON_COMPOUNDS], taxRate: hostTax }),
  ];
}

const perDay = (perHour: number) => perHour * 24;

describe('planEconomics', () => {
  it('gives a plan that is exactly the Baseline a Lift of zero', () => {
    const colonies = [
      colony(1, 'barren', { rates: [BASE_METALS], taxRate: 0.05 }),
      colony(2, 'barren', { rates: [NOBLE_METALS], taxRate: 0.2 }),
    ];
    const { baseline, economics } = cost(
      [
        { typeId: REACTIVE_METALS, unitsPerDay: perDay(40) },
        { typeId: PRECIOUS_METALS, unitsPerDay: perDay(40) },
      ],
      colonies,
      ONE_ECU
    );
    if (economics.status !== 'costed') throw new Error(economics.status);
    expect(economics.netPerHour).toBeCloseTo(baseline.iskPerHour, 6);
    expect(economics.liftPerHour).toBeCloseTo(0, 6);
    // Each extractor pays export customs at its own rate.
    expect(economics.customs.exportFromExtractors).toBeCloseTo(40 * 400 * 0.05 + 40 * 400 * 0.2);
    expect(economics.perColony.get(2)?.planIskPerHour).toBeCloseTo(
      economics.perColony.get(2)!.baselineIskPerHour
    );
  });

  it("charges the host's imports and exports at its own rate, and counts its forfeited Baseline", () => {
    const colonies = coolantColonies(0.3);
    const { plan, baseline, economics } = cost(
      [{ typeId: COOLANT, unitsPerDay: perDay(5) }],
      colonies
    );
    expect(plan.factoryHost?.planetId).toBe(3);
    if (economics.status !== 'costed') throw new Error(economics.status);
    expect(economics.customs.importToHost).toBeCloseTo((40 + 40) * 0.3 * 400 * 0.5);
    expect(economics.customs.exportFromHost).toBeCloseTo(5 * 0.3 * 7200);
    expect(economics.revenue).toBeCloseTo(5 * 20_000);
    expect(economics.salesTax).toBeCloseTo(5 * 20_000 * 0.04);

    const hostBaseline = baseline.perColony.get(3);
    if (hostBaseline?.status !== 'ok') throw new Error('host baseline');
    expect(hostBaseline.iskPerHour).toBeGreaterThan(0);
    expect(economics.perColony.get(3)?.baselineIskPerHour).toBe(hostBaseline.iskPerHour);
    expect(economics.baselinePerHour).toBe(baseline.iskPerHour);
    expect(economics.liftPerHour).toBeCloseTo(economics.netPerHour - baseline.iskPerHour);
  });

  it('asks for a price rather than costing an unpriced sale at zero', () => {
    const books = { ...BOOKS, bid: { ...BOOKS.bid, [COOLANT]: undefined as unknown as number } };
    const { economics } = cost(
      [{ typeId: COOLANT, unitsPerDay: perDay(5) }],
      coolantColonies(0.1),
      POLICY,
      books
    );
    expect(economics).toEqual({ status: 'needs-price', missing: [COOLANT] });
  });

  it('costs buys at the ask only when the pilot allows buying', () => {
    const colonies = [colony(1, 'barren', { rates: [BASE_METALS] })];
    const goals = [{ typeId: REACTIVE_METALS, unitsPerDay: perDay(120) }];

    const noBuy = cost(goals, colonies).economics;
    if (noBuy.status !== 'costed') throw new Error(noBuy.status);
    expect(noBuy.buys).toBe(0);

    const withBuy = cost(goals, colonies, { ...POLICY, buyTiers: [1] }).economics;
    if (withBuy.status !== 'costed') throw new Error(withBuy.status);
    // 72 made, 48 bought at the ask, all 120 valued at the bid.
    expect(withBuy.buys).toBeCloseTo(48 * 550);
    expect(withBuy.revenue).toBeCloseTo(120 * 500);
  });
});
