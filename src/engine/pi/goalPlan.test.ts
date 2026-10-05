import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { planGoals } from './goalPlan';
import type { Goal, PlannerColony, PlannerPolicy, PlanetType, PriceBooks } from './goalTypes';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BASE_METALS = 2267;
const AQUEOUS_LIQUIDS = 2268;
const IONIC_SOLUTIONS = 2309;
const REACTIVE_METALS = 2398;
const PRECIOUS_METALS = 2399;
const WATER = 3645;
const COOLANT = 9832;
const WATER_COOLED_CPU = 2328;
const WETWARE_MAINFRAME = 2876;

const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};
const BOOKS: PriceBooks = { ask: {}, bid: {}, salesTaxPct: 0 };

/** Every P1 at one bid, so each colony has a priced Baseline. */
function pricedBooks(overrides: Record<number, number> = {}): PriceBooks {
  const bid: Record<number, number> = {};
  for (const [id, s] of Object.entries(pi.schematics))
    if (s.inputs.length === 1) bid[Number(id)] = 1000;
  Object.assign(bid, overrides);
  return { ask: bid, bid, salesTaxPct: 0 };
}

/** A colony yielding every P0 its planet type can, at `rate` per ECU. */
function colony(planetId: number, planetType: PlanetType, cc = 5, rate = 6000): PlannerColony {
  const row = pi.infrastructure.commandCenterUpgrades[cc];
  return {
    planetId,
    planetType,
    budget: { cpu: row.cpu, powergrid: row.powergrid },
    newLinkCost: { cpu: 15, powergrid: 10 },
    headsPerExtractor: 10,
    taxRate: 0.1,
    ratePerEcu: new Map(
      pi.raw
        .filter((r) => r.planetTypes.includes(planetType))
        .map((r) => [r.typeID, { unitsPerHour: rate, source: 'assumed' as const }])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

function plan(
  goals: Goal[],
  colonies: PlannerColony[],
  policy: PlannerPolicy = POLICY,
  books: PriceBooks = BOOKS
) {
  return planGoals({ goals, colonies, policy, books }, pi);
}

/** A goal at `perHour`, expressed per day the way the pilot types it. */
const goal = (typeId: number, perHour: number): Goal => ({ typeId, unitsPerDay: perHour * 24 });

describe('planGoals — demand', () => {
  it('sums a shared input into one line and re-ceils its factories on the total', () => {
    const result = plan(
      [goal(COOLANT, 2.5), goal(WATER_COOLED_CPU, 2.5)],
      [colony(1, 'barren'), colony(2, 'storm'), colony(3, 'gas')]
    );
    const water = result.demand.filter((line) => line.typeId === WATER);
    // 20 Water/h each is half a basic apiece; together exactly one.
    expect(water).toEqual([expect.objectContaining({ tier: 1, unitsPerHour: 40, factories: 1 })]);
  });

  it('plans nothing for no goals: every colony idle', () => {
    const result = plan([], [colony(2, 'barren'), colony(1, 'lava')]);
    expect(result.demand).toEqual([]);
    expect(result.flows).toEqual([]);
    expect(result.factoryHost).toBeNull();
    expect(result.assignments.map((a) => [a.planetId, a.role])).toEqual([
      [1, 'idle'],
      [2, 'idle'],
    ]);
  });
});

describe('planGoals — factory host', () => {
  it('needs no host for a P1 goal, and ships it straight to the hub', () => {
    const result = plan([goal(REACTIVE_METALS, 40)], [colony(1, 'barren')]);
    expect(result.factoryHost).toBeNull();
    expect(result.assignments[0]).toMatchObject({
      role: 'extract',
      slots: [{ p0TypeId: BASE_METALS, ecus: 1 }],
    });
    expect(result.flows).toEqual([
      { from: 1, to: 'hub', typeId: REACTIVE_METALS, tier: 1, unitsPerHour: 40 },
    ]);
    // 40/h × 0.19 m3 × 168 h.
    expect(result.hauling.m3PerWeek).toBeCloseTo(40 * 0.19 * 168);
  });

  it('reports a P4 with no Barren or Temperate colony as a missing High-Tech host', () => {
    const result = plan([goal(WETWARE_MAINFRAME, 1)], [colony(1, 'lava'), colony(2, 'gas')]);
    expect(result.factoryHost).toBeNull();
    expect(result.shortfalls).toEqual([{ kind: 'no-factory-host', facility: 'highTech' }]);
    expect(result.demand).toEqual([
      expect.objectContaining({ typeId: WETWARE_MAINFRAME, source: 'short' }),
    ]);
  });

  it('hosts on the colony whose extraction is least needed, not the lowest id', () => {
    // Ionic Solutions comes off gas and storm only; temperate yields neither,
    // so its extraction is the least needed — and it still makes its own Water.
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'gas'), colony(2, 'storm'), colony(3, 'temperate')]
    );
    expect(result.factoryHost).toEqual({ planetId: 3, reason: 'least-needed-extraction' });
    expect(result.assignments.find((a) => a.planetId === 3)).toMatchObject({
      role: 'factory',
      slots: [{ p0TypeId: AQUEOUS_LIQUIDS, ecus: 1 }],
      factories: { advanced: 1 },
    });
    // Its own Water never leaves the planet; the Electrolytes are shipped in.
    expect(result.flows).toContainEqual({
      from: 3,
      to: 3,
      typeId: WATER,
      tier: 1,
      unitsPerHour: 40,
    });
    expect(result.flows).toContainEqual({
      from: 1,
      to: 3,
      typeId: 2390,
      tier: 1,
      unitsPerHour: 40,
    });
    expect(result.flows).toContainEqual({
      from: 3,
      to: 'hub',
      typeId: COOLANT,
      tier: 2,
      unitsPerHour: 5,
    });
  });

  it('breaks a scarcity tie on the smaller Baseline the host gives up', () => {
    // Two temperates, same score; the slower one forfeits less.
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'gas'), colony(4, 'temperate'), colony(5, 'temperate', 5, 3000)],
      POLICY,
      pricedBooks()
    );
    expect(result.factoryHost?.planetId).toBe(5);
  });

  it('breaks an exact host tie on the lower planet id', () => {
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(9, 'gas'), colony(5, 'temperate'), colony(4, 'temperate')]
    );
    expect(result.factoryHost?.planetId).toBe(4);
  });

  it('flags a host whose factories overrun its Command Center', () => {
    // CC0's 1675 tf cannot carry even the Launchpad's 3600; the extractors are fine.
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'gas'), colony(2, 'storm'), colony(3, 'temperate', 0)]
    );
    expect(result.shortfalls).toContainEqual(
      expect.objectContaining({ kind: 'host-over-budget', planetId: 3 })
    );
    // Nothing gets made, so the second pass needs no host and touches nothing.
    expect(result.factoryHost).toBeNull();
    expect(result.assignments.every((a) => a.role !== 'extract' && a.role !== 'factory')).toBe(
      true
    );
    // Factories that cannot be built make nothing, so nothing is shipped or priced off them.
    expect(result.achieved).toEqual([{ typeId: COOLANT, unitsPerHour: 0, fraction: 0 }]);
    expect(result.flows.filter((f) => f.from === 3 || f.to === 3)).toEqual([]);
    expect(result.demand.find((l) => l.typeId === COOLANT)?.source).toBe('short');
  });
});

describe('planGoals — extraction and shortfalls', () => {
  it('names the planet types that would close a type gap', () => {
    const result = plan([goal(REACTIVE_METALS, 40)], [colony(1, 'temperate')]);
    expect(result.shortfalls).toEqual([
      {
        kind: 'type-gap',
        p0TypeId: BASE_METALS,
        p1TypeId: REACTIVE_METALS,
        unitsPerHour: 6000,
        fixPlanetTypes: ['barren', 'gas', 'lava', 'plasma', 'storm'],
      },
    ]);
    expect(result.assignments[0].role).toBe('idle');
  });

  it('calls a budget gap when the colonies that could yield it are full', () => {
    // Two ECUs on one P0 make 72 P1/h; the other 48 are short, in P0 units.
    const result = plan([goal(REACTIVE_METALS, 120)], [colony(1, 'barren')]);
    expect(result.assignments[0].slots).toMatchObject([{ p0TypeId: BASE_METALS, ecus: 2 }]);
    expect(result.shortfalls).toEqual([
      {
        kind: 'budget-gap',
        p0TypeId: BASE_METALS,
        p1TypeId: REACTIVE_METALS,
        unitsPerHour: expect.closeTo(48 * 150, 6),
      },
    ]);
    expect(result.buys).toEqual([]);
  });

  it('buys the short P1 instead when the pilot allows buying P1', () => {
    const result = plan([goal(REACTIVE_METALS, 120)], [colony(1, 'barren')], {
      ...POLICY,
      buyTiers: [1],
    });
    expect(result.shortfalls).toEqual([]);
    expect(result.buys).toEqual([
      { typeId: REACTIVE_METALS, tier: 1, unitsPerHour: expect.closeTo(48, 6) },
    ]);
    expect(result.demand.find((l) => l.typeId === REACTIVE_METALS)?.source).toBe('bought');
  });

  it('gives a colony a second, different P0 before calling anything a budget gap', () => {
    const result = plan(
      [goal(REACTIVE_METALS, 40), goal(PRECIOUS_METALS, 40)],
      [colony(1, 'barren')]
    );
    expect(result.shortfalls).toEqual([]);
    expect(result.assignments[0].slots.map((s) => s.p1TypeId)).toEqual([
      REACTIVE_METALS,
      PRECIOUS_METALS,
    ]);
  });

  it('assigns the scarcest P0 first', () => {
    // Ionic Solutions only comes off gas; Base Metals off gas or lava. Taking
    // Base Metals first onto the gas colony at two ECUs would leave Ionic
    // Solutions short.
    const result = plan(
      [goal(REACTIVE_METALS, 72), goal(2390, 72)],
      [colony(1, 'gas'), colony(2, 'lava')]
    );
    expect(result.shortfalls).toEqual([]);
    expect(result.assignments.map((a) => a.slots.map((s) => s.p0TypeId))).toEqual([
      [IONIC_SOLUTIONS],
      [BASE_METALS],
    ]);
  });

  it('ships only what the scarcest input allows, and releases extraction nothing consumes', () => {
    // Coolant at 10/h needs 80 Electrolytes and 80 Water. Storm is the only
    // Ionic Solutions source and two ECUs make 72 of the 80, so Coolant runs at
    // 90%. The first pass sized Water for 80 across three temperates; the
    // second, at 9/h, needs 72 — the host's own ECU plus one more.
    const result = plan(
      [goal(COOLANT, 10)],
      [colony(1, 'storm'), colony(2, 'temperate'), colony(3, 'temperate'), colony(4, 'temperate')]
    );
    expect(result.factoryHost?.planetId).toBe(2);
    expect(result.achieved).toEqual([
      { typeId: COOLANT, unitsPerHour: expect.closeTo(9, 6), fraction: expect.closeTo(0.9, 6) },
    ]);
    expect(result.flows).toContainEqual({
      from: 2,
      to: 'hub',
      typeId: COOLANT,
      tier: 2,
      unitsPerHour: expect.closeTo(9, 6),
    });
    const waterToHost = result.flows
      .filter((f) => f.typeId === WATER && f.to === 2)
      .reduce((sum, f) => sum + f.unitsPerHour, 0);
    expect(waterToHost).toBeCloseTo(72);
    expect(result.surplusP1).toEqual([{ typeId: WATER, unitsPerHour: expect.closeTo(8, 6) }]);
    expect(result.assignments.find((a) => a.planetId === 4)?.role).toBe('idle');
    // The shortfall still describes the goal as asked for.
    expect(result.shortfalls).toEqual([
      expect.objectContaining({ kind: 'budget-gap', p0TypeId: IONIC_SOLUTIONS }),
    ]);
  });

  it('retargets nothing for a goal that reaches zero: every colony keeps its Baseline', () => {
    // No temperate yields Ionic Solutions, so Coolant is a type gap and makes nothing.
    const books = pricedBooks();
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'temperate'), colony(2, 'temperate')],
      POLICY,
      books
    );
    expect(result.achieved).toEqual([{ typeId: COOLANT, unitsPerHour: 0, fraction: 0 }]);
    expect(result.shortfalls).toEqual([expect.objectContaining({ kind: 'type-gap' })]);
    expect(result.factoryHost).toBeNull();
    expect(result.assignments.map((a) => a.role)).toEqual(['baseline', 'baseline']);
  });

  it('keeps a colony the plan does not need on its Baseline, selling it', () => {
    const result = plan([], [colony(1, 'barren')], POLICY, pricedBooks({ 2399: 5000 }));
    expect(result.assignments[0]).toMatchObject({
      role: 'baseline',
      slots: [{ p1TypeId: PRECIOUS_METALS, ecus: 2 }],
    });
    expect(result.flows).toEqual([
      { from: 1, to: 'hub', typeId: PRECIOUS_METALS, tier: 1, unitsPerHour: 72 },
    ]);
  });

  it('fills a used colony’s spare slot with its best-selling P1', () => {
    // One ECU covers the goal; the second P0 slot sells Precious Metals.
    const result = plan(
      [goal(REACTIVE_METALS, 40)],
      [colony(1, 'barren')],
      POLICY,
      pricedBooks({ 2399: 5000 })
    );
    expect(result.assignments[0].slots.map((s) => [s.p1TypeId, s.ecus])).toEqual([
      [REACTIVE_METALS, 1],
      [PRECIOUS_METALS, 1],
    ]);
    expect(result.flows).toContainEqual({
      from: 1,
      to: 'hub',
      typeId: PRECIOUS_METALS,
      tier: 1,
      unitsPerHour: 40,
    });
  });

  it('sells whole-ECU overshoot as surplus P1', () => {
    const result = plan([goal(REACTIVE_METALS, 30)], [colony(1, 'barren')]);
    expect(result.surplusP1).toEqual([{ typeId: REACTIVE_METALS, unitsPerHour: 10 }]);
  });
});
