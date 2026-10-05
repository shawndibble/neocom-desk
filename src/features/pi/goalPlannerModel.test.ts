import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import { restartCadenceYield } from '@/engine/pi/restartCadence';
import { extractorProgramsFromPins } from './adapters';
import { colonyBudget } from './colonyBudget';
import { planBest } from '@/engine/pi/planBest';
import { builtColonyEarnings } from './colonyEarningsModel';
import type { GoalPlan } from '@/engine/pi/goalTypes';
import {
  ASSUMED_UNKNOWN_CUSTOMS,
  DEFAULT_PLANNER_HEADS,
  earningsNow,
  goalPlannerInput,
  planHauling,
  planVerdict,
  plannerColonies,
  plannerPolicy,
  priceBooks,
  type PlannerSnapshot,
  type PlannerPrefs,
} from './goalPlannerModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BACTERIA = 2393;
const WATER = 3645;
const ELECTROLYTES = 2390;
const IONIC_SOLUTIONS = 2309;

const HIGHSEC_SYSTEM = 30000142;
const NULLSEC_SYSTEM = 30004759;
const NOW = Date.parse('2026-10-01T00:00:00Z');
const HOUR = 3_600_000;

const ECU = 2848;
const LAUNCHPAD = 2256;
const BASIC = 2469;

function ecuPin(pinId: number, product: number, heads: number, qty = 6_000): PlanetPin {
  return {
    pin_id: pinId,
    type_id: ECU,
    latitude: 0.1 * pinId,
    longitude: 0.2,
    install_time: new Date(NOW - 2 * HOUR).toISOString(),
    expiry_time: new Date(NOW + 70 * HOUR).toISOString(),
    extractor_details: {
      heads: Array.from({ length: heads }, (_, i) => ({ head_id: i, latitude: 0, longitude: 0 })),
      product_type_id: product,
      qty_per_cycle: qty,
      cycle_time: 1800,
    },
  };
}

function pin(pinId: number, typeId: number): PlanetPin {
  return { pin_id: pinId, type_id: typeId, latitude: 0.3 * pinId, longitude: 0.5 };
}

function planet(planetId: number, systemId: number, type: CharacterPlanet['planet_type']) {
  return {
    solar_system_id: systemId,
    planet_id: planetId,
    planet_type: type,
    owner_id: 1,
    last_update: '2026-09-30T00:00:00Z',
    upgrade_level: 4,
    num_pins: 4,
  } satisfies CharacterPlanet;
}

/** A temperate colony pulling Microorganisms on two 7-head ECUs, linked to its pad. */
const TEMPERATE_ID = 40000001;
const temperateDetail: CharacterPlanetDetail = {
  pins: [
    ecuPin(1, MICROORGANISMS, 7),
    ecuPin(2, MICROORGANISMS, 7),
    pin(3, LAUNCHPAD),
    pin(4, BASIC),
  ],
  links: [
    { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
    { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
  ],
  routes: [],
};

/** An oceanic colony with only a pad: no extractors, no links. */
const OCEANIC_ID = 40000002;
const oceanicDetail: CharacterPlanetDetail = {
  pins: [pin(1, LAUNCHPAD)],
  links: [],
  routes: [],
};

/** A gas colony in nullsec whose detail never loaded. */
const GAS_ID = 40000003;

function snapshot(overrides: Partial<PlannerSnapshot> = {}): PlannerSnapshot {
  return {
    pi,
    nowMs: NOW,
    colonies: [
      planet(TEMPERATE_ID, HIGHSEC_SYSTEM, 'temperate'),
      planet(OCEANIC_ID, NULLSEC_SYSTEM, 'oceanic'),
      planet(GAS_ID, NULLSEC_SYSTEM, 'gas'),
    ],
    details: new Map([
      [TEMPERATE_ID, temperateDetail],
      [OCEANIC_ID, oceanicDetail],
    ]),
    planetRadiusKm: new Map([
      [TEMPERATE_ID, 5_000],
      [OCEANIC_ID, 4_000],
      [GAS_ID, 30_000],
    ]),
    securityBySystem: new Map([
      [HIGHSEC_SYSTEM, 0.95],
      [NULLSEC_SYSTEM, -0.4],
    ]),
    customsSkill: 4,
    ...overrides,
  };
}

const PREFS: PlannerPrefs = {
  restartHours: 72,
  fallbackRatePerHour: 4_000,
  customsOverrides: {},
  disabled: new Set(),
};

function measuredAt(hours: number): number {
  const program = extractorProgramsFromPins([ecuPin(1, MICROORGANISMS, 7)])[0];
  return restartCadenceYield({ program, cadences: [hours] })[0].unitsPerHour;
}

describe('plannerColonies', () => {
  it('builds a PlannerColony per colony with detail, budget from its own CC level', () => {
    const rows = plannerColonies(snapshot(), PREFS);
    const temperate = rows.find((row) => row.planetId === TEMPERATE_ID)!;
    expect(temperate.excluded).toBeNull();
    expect(temperate.colony?.budget).toEqual(colonyBudget(4, pi).budget);
    expect(temperate.colony?.planetType).toBe('temperate');
    expect(temperate.colony?.current.p0TypeIds).toEqual([MICROORGANISMS]);
  });

  it('keys ratePerEcu on exactly the P0s the planet type yields', () => {
    const rows = plannerColonies(snapshot(), PREFS);
    const temperate = rows.find((row) => row.planetId === TEMPERATE_ID)!.colony!;
    const local = pi.raw
      .filter((r) => r.planetTypes.includes('temperate'))
      .map((r) => r.typeID)
      .sort((a, b) => a - b);
    expect([...temperate.ratePerEcu.keys()].sort((a, b) => a - b)).toEqual(local);
  });

  it('rates a P0 the colony extracts at its own program re-projected at the restart cadence', () => {
    const temperate = plannerColonies(snapshot(), PREFS).find(
      (row) => row.planetId === TEMPERATE_ID
    )!.colony!;
    const rate = temperate.ratePerEcu.get(MICROORGANISMS)!;
    expect(rate.source).toBe('measured');
    expect(rate.unitsPerHour).toBeCloseTo(measuredAt(72), 6);
    // A shorter cadence restarts nearer the curve's peak.
    const daily = plannerColonies(snapshot(), { ...PREFS, restartHours: 24 })
      .find((row) => row.planetId === TEMPERATE_ID)!
      .colony!.ratePerEcu.get(MICROORGANISMS)!;
    expect(daily.unitsPerHour).toBeGreaterThan(rate.unitsPerHour);
  });

  it("rates every other P0 at the pilot's own measured mean, and with nothing measured, at the fallback", () => {
    const rows = plannerColonies(snapshot(), PREFS);
    const oceanic = rows.find((row) => row.planetId === OCEANIC_ID)!.colony!;
    expect(oceanic.ratePerEcu.get(AQUEOUS_LIQUIDS)).toEqual({
      unitsPerHour: expect.closeTo(measuredAt(72), 6),
      source: 'own-mean',
    });

    const unmeasured = plannerColonies(
      snapshot({
        details: new Map([
          // Linked, so there is a hop to borrow, but no extractor to measure.
          [TEMPERATE_ID, { ...temperateDetail, pins: temperateDetail.pins.slice(2) }],
          [OCEANIC_ID, oceanicDetail],
        ]),
      }),
      PREFS
    );
    expect(
      unmeasured.find((row) => row.planetId === OCEANIC_ID)!.colony!.ratePerEcu.get(AQUEOUS_LIQUIDS)
    ).toEqual({ unitsPerHour: 4_000, source: 'assumed' });
  });

  it("reads heads off the colony's own ECUs, else the pilot's mean, else a stated default", () => {
    const rows = plannerColonies(snapshot(), PREFS);
    expect(rows.find((row) => row.planetId === TEMPERATE_ID)!.colony!.headsPerExtractor).toBe(7);
    const oceanic = rows.find((row) => row.planetId === OCEANIC_ID)!;
    expect(oceanic.colony!.headsPerExtractor).toBe(7);
    expect(oceanic.headsAssumed).toBe(true);

    const alone = plannerColonies(
      snapshot({
        colonies: [planet(OCEANIC_ID, NULLSEC_SYSTEM, 'oceanic')],
        details: new Map([[OCEANIC_ID, { ...oceanicDetail, links: [] }]]),
      }),
      PREFS
    );
    // No link cost anywhere to borrow: excluded, and says why.
    expect(alone[0].excluded).toBe('no-link-cost');
    expect(DEFAULT_PLANNER_HEADS).toBeGreaterThan(0);
  });

  it("borrows the pilot's own median link cost for a colony with no link to measure", () => {
    const rows = plannerColonies(snapshot(), PREFS);
    const temperate = rows.find((row) => row.planetId === TEMPERATE_ID)!;
    const oceanic = rows.find((row) => row.planetId === OCEANIC_ID)!;
    expect(temperate.linkCostBorrowed).toBe(false);
    expect(oceanic.linkCostBorrowed).toBe(true);
    expect(oceanic.colony!.newLinkCost).toEqual(temperate.colony!.newLinkCost);
  });

  it('lists a colony whose detail never loaded, excluded with that reason', () => {
    const gas = plannerColonies(snapshot(), PREFS).find((row) => row.planetId === GAS_ID)!;
    expect(gas.colony).toBeNull();
    expect(gas.excluded).toBe('no-detail');
    expect(gas.enabled).toBe(false);
  });

  it("charges each colony its system's customs: override first, else the band default after skill", () => {
    const rows = plannerColonies(snapshot(), PREFS);
    const temperate = rows.find((row) => row.planetId === TEMPERATE_ID)!;
    expect(temperate.colony!.taxRate).toBeCloseTo(0.06, 9);
    expect(temperate.taxSource).toEqual({ kind: 'highsec-skill', level: 4 });
    expect(temperate.rateUnknown).toBe(false);

    const oceanic = rows.find((row) => row.planetId === OCEANIC_ID)!;
    // A player office's rate is unknowable, so until the pilot sets it the
    // plan is costed at a conservative 10%, never the band's 0% placeholder.
    expect(oceanic.rateUnknown).toBe(true);
    expect(oceanic.taxAssumed).toBe(true);
    expect(oceanic.colony!.taxRate).toBe(ASSUMED_UNKNOWN_CUSTOMS);
    expect(ASSUMED_UNKNOWN_CUSTOMS).toBe(0.1);

    const overridden = plannerColonies(snapshot(), {
      ...PREFS,
      customsOverrides: { [NULLSEC_SYSTEM]: 0.12 },
    }).find((row) => row.planetId === OCEANIC_ID)!;
    expect(overridden.colony!.taxRate).toBe(0.12);
    expect(overridden.taxOverridden).toBe(true);
    expect(overridden.rateUnknown).toBe(false);
    expect(overridden.taxAssumed).toBe(false);
  });

  it('marks a colony the pilot switched off as not enabled, and goalPlannerInput leaves it out', () => {
    const rows = plannerColonies(snapshot(), { ...PREFS, disabled: new Set([OCEANIC_ID]) });
    expect(rows.find((row) => row.planetId === OCEANIC_ID)!.enabled).toBe(false);
    expect(goalPlannerInput(rows).map((c) => c.planetId)).toEqual([TEMPERATE_ID]);
  });
});

describe('plannerPolicy', () => {
  it('runs up to two ECUs, buys only P1 and only when allowed', () => {
    expect(plannerPolicy({ maxP0Types: 1, buyP1: false })).toMatchObject({
      maxEcusPerColony: 2,
      maxP0TypesPerColony: 1,
      buyTiers: [],
    });
    expect(plannerPolicy({ maxP0Types: 2, buyP1: true }).buyTiers).toEqual([1]);
  });
});

describe('priceBooks', () => {
  it('sells at the bid where the hub has one and the ask where it does not', () => {
    const books = priceBooks({ prices: { 1: 100, 2: 50 }, buyPrices: { 1: 90 } }, 3);
    expect(books.ask).toEqual({ 1: 100, 2: 50 });
    expect(books.bid).toEqual({ 1: 90, 2: 50 });
  });

  it('names the types it values at the ask for want of a buy order', () => {
    const books = priceBooks({ prices: { 1: 100, 2: 50, 3: 7 }, buyPrices: { 1: 90 } }, 3);
    expect([...books.valuedAtAsk].sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it('charges sales tax at the Accounting level, Accounting 0 when unknown', () => {
    expect(priceBooks({ prices: {}, buyPrices: {} }, 5).salesTaxPct).toBeLessThan(
      priceBooks({ prices: {}, buyPrices: {} }, null).salesTaxPct
    );
  });
});

function allPriced(): { prices: Record<number, number>; buyPrices: Record<number, number> } {
  const prices: Record<number, number> = {};
  for (const id of Object.keys(pi.schematics)) prices[Number(id)] = 1_000;
  for (const r of pi.raw) prices[r.typeID] = 5;
  return { prices, buyPrices: {} };
}

describe('planHauling', () => {
  it('splits each colony into out and in per trip, and compares the total with the Baseline', () => {
    const rows = plannerColonies(snapshot(), PREFS);
    const colonies = goalPlannerInput(rows);
    const best = planBest(
      {
        goals: [{ typeId: WATER, unitsPerDay: 24 }],
        colonies,
        policy: plannerPolicy({ maxP0Types: 2, buyP1: false }),
        books: priceBooks(allPriced(), 5),
      },
      pi
    );
    const hauling = planHauling(best.plan, best.baseline, pi, 24);
    const p1Volume = pi.schematics[String(BACTERIA)].volume;
    // Everything the plan moves is P1 here, so its total is units x volume x hours.
    const planUnits = best.plan.flows
      .filter((f) => f.from !== f.to)
      .reduce((sum, f) => sum + f.unitsPerHour, 0);
    expect(hauling.planM3PerTrip).toBeCloseTo(planUnits * p1Volume * 24, 6);
    const totalOut = [...hauling.perColony.values()].reduce((sum, c) => sum + c.outM3, 0);
    const totalIn = [...hauling.perColony.values()].reduce((sum, c) => sum + c.inM3, 0);
    expect(totalOut).toBeGreaterThan(0);
    expect(totalIn).toBe(0);
    expect(hauling.baselineM3PerTrip).toBeGreaterThan(0);
  });

  it('counts a colony-to-colony leg once in the total but on both colonies', () => {
    const plan = {
      flows: [
        { from: 1, to: 2, typeId: ELECTROLYTES, tier: 1, unitsPerHour: 10 },
        { from: 2, to: 2, typeId: ELECTROLYTES, tier: 1, unitsPerHour: 99 },
        { from: 'hub', to: 'hub', typeId: ELECTROLYTES, tier: 1, unitsPerHour: 99 },
        { from: 'hub', to: 2, typeId: IONIC_SOLUTIONS, tier: 0, unitsPerHour: 0 },
      ],
    } as unknown as GoalPlan;
    const hauling = planHauling(
      plan,
      {
        iskPerHour: 0,
        perColony: new Map(),
        missing: [],
        haulEffort: { m3JumpsPerHour: 0, unknownLegs: 0 },
      },
      pi,
      1
    );
    const vol = pi.schematics[String(ELECTROLYTES)].volume;
    expect(hauling.perColony.get(1)).toEqual({ outM3: 10 * vol, inM3: 0 });
    expect(hauling.perColony.get(2)).toEqual({ outM3: 0, inM3: 10 * vol });
    expect(hauling.planM3PerTrip).toBeCloseTo(10 * vol, 9);
  });
});

describe('planVerdict', () => {
  const effort = (m3JumpsPerHour: number, unknownLegs = 0) => ({ m3JumpsPerHour, unknownLegs });

  it('reads a positive Lift as earning more, with hauling effort (m3 x jumps) against the Baseline', () => {
    expect(planVerdict(1_000, effort(50), effort(100))).toEqual({
      lift: 'more',
      haulChange: -0.5,
      distances: 'known',
    });
  });

  it('reads a negative Lift as earning less', () => {
    expect(planVerdict(-240_000, effort(40), effort(100))).toEqual({
      lift: 'less',
      haulChange: -0.6,
      distances: 'known',
    });
  });

  it('claims no hauling change while any leg on either side has no distance', () => {
    expect(planVerdict(1_000, effort(50, 2), effort(100))).toEqual({
      lift: 'more',
      haulChange: null,
      distances: 'unknown',
    });
    expect(planVerdict(1_000, effort(50), effort(100, 1)).distances).toBe('unknown');
  });

  it('calls a Lift within a rounding of zero the same, and has no change with no Baseline effort', () => {
    expect(planVerdict(0.4, effort(10), effort(0))).toEqual({
      lift: 'same',
      haulChange: null,
      distances: 'known',
    });
  });
});

describe('earningsNow', () => {
  it('sums what the enabled colonies earn today, each at its own customs rate', () => {
    const priced = allPriced();
    const rows = plannerColonies(snapshot(), PREFS);
    const total = earningsNow(rows, pi, priced, 3.6);
    const temperate = rows.find((row) => row.planetId === TEMPERATE_ID)!;
    const alone = builtColonyEarnings(temperate.advice!, pi, {
      prices: priced.prices,
      revenuePrices: { ...priced.prices, ...priced.buyPrices },
      taxRate: temperate.taxRate,
      salesTaxPct: 3.6,
    });
    // The oceanic colony extracts nothing, so it contributes no figure.
    expect(total.iskPerHour).toBeCloseTo(alone.iskPerHour!, 6);
    expect(total.coloniesWithoutFigure).toBe(1);
    // Named, so the page can say which colony the figure leaves out.
    expect(total.leftOut).toEqual([OCEANIC_ID]);
    // Per colony too, for a not-needed colony's switch tip.
    expect(total.byPlanet.get(TEMPERATE_ID)).toBeCloseTo(alone.iskPerHour!, 6);
    expect(total.byPlanet.get(OCEANIC_ID)).toBeNull();

    const off = earningsNow(
      plannerColonies(snapshot(), { ...PREFS, disabled: new Set([TEMPERATE_ID]) }),
      pi,
      priced,
      3.6
    );
    expect(off.iskPerHour).toBeNull();
  });
});
