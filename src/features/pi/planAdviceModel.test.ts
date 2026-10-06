import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import { piTier } from '@/engine/pi/chain';
import { rankRecipes } from '@/engine/pi/planRecipes';
import { builtColonyEarnings } from './colonyEarningsModel';
import { builtAdvice } from './advisorModel';
import type { PiCadence } from './cadencePref';
import { plannerColonies, type PlannerSnapshot } from './goalPlannerModel';
import { ASSUMED_UNKNOWN_CUSTOMS } from './colonyCustoms';
import {
  buildPlanAdvice,
  hubBooks,
  planColonyAnchor,
  type PlanAdviceInput,
} from './planAdviceModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const HIGHSEC_SYSTEM = 30000142;
const NULLSEC_SYSTEM = 30004759;
const NOW = Date.parse('2026-10-01T00:00:00Z');
const HOUR = 3_600_000;

const ECU = 2848;
const LAUNCHPAD = 2256;
const BASIC = 2469;

/**
 * Round, deterministic prices for every planetary commodity: P0 at 5, P1 near
 * 1,500, P2 near 36,000, so a made tier visibly out-earns raw and the ranking has
 * something to rank.
 */
function pricesFor(): { prices: Record<number, number>; buyPrices: Record<number, number> } {
  const prices: Record<number, number> = {};
  const buyPrices: Record<number, number> = {};
  for (const raw of pi.raw) {
    prices[raw.typeID] = 5;
    buyPrices[raw.typeID] = 4.5;
  }
  const byTier: Record<number, number> = { 1: 1_500, 2: 36_000, 3: 140_000, 4: 1_000_000 };
  for (const key of Object.keys(pi.schematics)) {
    const typeId = Number(key);
    const base = byTier[piTier(typeId, pi)];
    prices[typeId] = base + (typeId % 7) * (base / 100);
    buyPrices[typeId] = prices[typeId] * 0.95;
  }
  return { prices, buyPrices };
}
const PRICES = pricesFor();

function ecuPin(
  pinId: number,
  product: number,
  heads: number,
  expiresInHours = 70,
  qty = 6_000
): PlanetPin {
  return {
    pin_id: pinId,
    type_id: ECU,
    latitude: 0.1 * pinId,
    longitude: 0.2,
    install_time: new Date(NOW - 2 * HOUR).toISOString(),
    expiry_time: new Date(NOW + expiresInHours * HOUR).toISOString(),
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

function planet(
  planetId: number,
  systemId: number,
  type: CharacterPlanet['planet_type']
): CharacterPlanet {
  return {
    solar_system_id: systemId,
    planet_id: planetId,
    planet_type: type,
    owner_id: 1,
    last_update: '2026-09-30T00:00:00Z',
    upgrade_level: 4,
    num_pins: 4,
  };
}

const TEMPERATE_ID = 40000001;
const OCEANIC_ID = 40000002;
const GAS_ID = 40000003;

/** A temperate colony pulling Microorganisms on two 7-head ECUs, linked to its pad. */
function temperateDetail(expiresInHours = 70, qty = 6_000): CharacterPlanetDetail {
  return {
    pins: [
      ecuPin(1, MICROORGANISMS, 7, expiresInHours, qty),
      ecuPin(2, MICROORGANISMS, 7, expiresInHours, qty),
      pin(3, LAUNCHPAD),
      pin(4, BASIC),
    ],
    links: [
      { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
      { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
    ],
    routes: [],
  };
}

/** An oceanic colony with only a pad: nothing extracted, nothing measurable. */
const oceanicDetail: CharacterPlanetDetail = {
  pins: [pin(1, LAUNCHPAD)],
  links: [],
  routes: [],
};

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
      [TEMPERATE_ID, temperateDetail()],
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

function input(overrides: Partial<PlanAdviceInput> = {}): PlanAdviceInput {
  return {
    snapshot: snapshot(),
    prefs: { restartHours: 72, fallbackRatePerHour: 12_000, customsOverrides: {} },
    books: hubBooks(PRICES, 5),
    market: { kind: 'hub' },
    cadence: { restartDays: 3, haulDays: 1 } satisfies PiCadence,
    preference: 'isk',
    recipeFilter: 'any',
    skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: 3 },
    planetNames: new Map([
      [TEMPERATE_ID, 'Hek VIII'],
      [OCEANIC_ID, 'Lustrevik III'],
    ]),
    ...overrides,
  };
}

const temperate = (advice: ReturnType<typeof buildPlanAdvice>) =>
  advice.colonies.find((colony) => colony.planetId === TEMPERATE_ID)!;

describe('buildPlanAdvice: today', () => {
  it("is the colony's own earnings model, in ISK a day, at its own customs rate", () => {
    const advice = buildPlanAdvice(input());
    const colony = temperate(advice);
    const built = builtAdvice(
      planet(TEMPERATE_ID, HIGHSEC_SYSTEM, 'temperate'),
      temperateDetail(),
      pi,
      5_000,
      NOW
    );
    const hourly = builtColonyEarnings(built, pi, {
      prices: PRICES.prices,
      revenuePrices: { ...PRICES.prices, ...PRICES.buyPrices },
      taxRate: colony.taxRate,
      salesTaxPct: hubBooks(PRICES, 5).salesTaxPct,
    }).iskPerHour!;
    // 7 days between hauls fills this colony's pad, so only the stalled share differs.
    expect(colony.todayPerDay! + colony.quickWinGainPerDay).toBeCloseTo(hourly * 24, 3);
  });

  it('has no figure, not zero, for a colony with nothing measurable, and counts it', () => {
    const advice = buildPlanAdvice(input());
    const oceanic = advice.colonies.find((colony) => colony.planetId === OCEANIC_ID)!;
    expect(oceanic.todayPerDay).toBeNull();
    expect(oceanic.afterRebuildPerDay).toBeNull();
    expect(advice.totals.unknownColonies).toBe(1);
    expect(advice.totals.todayPerDay).toBe(temperate(advice).todayPerDay);
  });

  it('leaves out, and names, a colony whose detail never loaded', () => {
    const advice = buildPlanAdvice(input());
    expect(advice.excluded).toEqual([{ planetId: GAS_ID, name: null, reason: 'no-detail' }]);
  });

  it('pays less at a corp buyback share than at the hub, with every figure moving together', () => {
    const hub = buildPlanAdvice(input());
    const buyback = buildPlanAdvice(input({ market: { kind: 'buyback', pct: 80 } }));
    expect(temperate(buyback).todayPerDay!).toBeLessThan(temperate(hub).todayPerDay!);
    expect(buyback.market).toEqual({ kind: 'buyback', pct: 80 });
    // A buyback is collected at home: no route to the market.
    expect(buyback.haul.route).toEqual({ kind: 'local' });
  });
});

describe('buildPlanAdvice: quick wins', () => {
  it('restarts a stopped extractor program, and today is zero while every one is stopped', () => {
    const advice = buildPlanAdvice(
      input({
        snapshot: snapshot({ details: new Map([[TEMPERATE_ID, temperateDetail(-10)]]) }),
      })
    );
    const colony = temperate(advice);
    expect(colony.todayPerDay).toBe(0);
    const restart = colony.quickWins.find((win) => win.id === `${TEMPERATE_ID}:restart-stopped`)!;
    expect(restart.detail).toMatchObject({ kind: 'restart', reason: 'stopped', extractors: 2 });
    expect(restart.gainPerDay).toBeGreaterThan(0);
    expect(colony.afterQuickWinsPerDay).toBeCloseTo(restart.gainPerDay!, 6);
  });

  it('adds up: today plus the priced quick wins is the after-quick-wins figure', () => {
    const colony = temperate(buildPlanAdvice(input()));
    const priced = colony.quickWins.reduce((sum, win) => sum + (win.gainPerDay ?? 0), 0);
    expect(colony.afterQuickWinsPerDay).toBeCloseTo(colony.todayPerDay! + priced, 6);
  });

  it('flags storage that fills before the haul, and gives the stalled income back', () => {
    const week = temperate(buildPlanAdvice(input({ cadence: { restartDays: 3, haulDays: 7 } })));
    const storage = week.quickWins.find((win) => win.detail.kind === 'storage');
    expect(storage).toBeDefined();
    expect(storage!.gainPerDay).toBeGreaterThan(0);
    // A pilot who hauls daily does not stall, so there is nothing to win and today is the full rate.
    const daily = temperate(buildPlanAdvice(input()));
    expect(daily.quickWins.some((win) => win.detail.kind === 'storage')).toBe(false);
    expect(daily.todayPerDay!).toBeGreaterThan(week.todayPerDay!);
  });

  it('orders every colony win by ISK per minute across the whole plan', () => {
    const { quickWins } = buildPlanAdvice(input());
    const rates = quickWins.map((win) => win.iskPerMinute ?? -1);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });
});

/**
 * A colony whose ground yields little raw ore: refining it beats selling it, so
 * there is a rebuild worth making. The default fixture's rich ground out-earns
 * every made tier, which is the Keep case.
 */
function leanSnapshot(upgradeLevel = 4): PlannerSnapshot {
  return snapshot({
    colonies: [
      { ...planet(TEMPERATE_ID, HIGHSEC_SYSTEM, 'temperate'), upgrade_level: upgradeLevel },
    ],
    details: new Map([[TEMPERATE_ID, temperateDetail(70, 3_000)]]),
  });
}

describe('buildPlanAdvice: rebuild', () => {
  it('changes a colony to a P1 or P2 recipe, never raw P0, and quotes the gain on top of quick wins', () => {
    const colony = temperate(buildPlanAdvice(input({ snapshot: leanSnapshot() })));
    if (colony.rebuild.status !== 'change') throw new Error('expected a change');
    for (const option of [colony.rebuild.pick, colony.rebuild.alternative]) {
      if (option) expect([1, 2]).toContain(option.tier);
    }
    expect(colony.rebuild.todayPerDay).toBeCloseTo(colony.afterQuickWinsPerDay!, 6);
    expect(colony.rebuild.gainPerDay).toBeCloseTo(
      colony.rebuild.pick.iskPerDay - colony.afterQuickWinsPerDay!,
      6
    );
    expect(colony.afterRebuildPerDay).toBeCloseTo(colony.rebuild.pick.iskPerDay, 6);
    expect(colony.rebuild.steps.some((step) => step.verb === 'set')).toBe(true);
  });

  it('carries the rebuild layout draw against the Command Center it needs, for the fit meters', () => {
    const changed = temperate(buildPlanAdvice(input({ snapshot: leanSnapshot() })));
    if (changed.rebuild.status !== 'change') throw new Error('expected a change');
    expect(changed.rebuildFit).not.toBeNull();
    const fit = changed.rebuildFit!;
    expect(fit.used.cpu).toBeGreaterThan(0);
    expect(fit.used.cpu).toBeLessThanOrEqual(fit.budget.cpu);
    expect(fit.used.powergrid).toBeLessThanOrEqual(fit.budget.powergrid);
    expect(fit.level).toBeGreaterThanOrEqual(changed.upgradeLevel);
    const kept = temperate(buildPlanAdvice(input()));
    expect(kept.rebuildFit).toBeNull();
  });

  it('keeps a colony whose ore out-earns every refined recipe, rather than selling nothing', () => {
    const colony = temperate(buildPlanAdvice(input()));
    expect(colony.rebuild).toMatchObject({ status: 'keep', reason: 'gain-too-small' });
    expect(colony.afterRebuildPerDay).toBeCloseTo(colony.afterQuickWinsPerDay!, 6);
  });

  it('compares a rebuild with absolute income: a rebuild is never a loss that looks like a gain', () => {
    const colony = temperate(buildPlanAdvice(input({ snapshot: leanSnapshot() })));
    if (colony.rebuild.status === 'refused') throw new Error('expected a scored rebuild');
    expect(colony.rebuild.best!.iskPerDay).toBeGreaterThan(0);
  });

  it('re-picks under least hauling: no more m3 than the most-ISK pick, and no more ISK', () => {
    const isk = temperate(buildPlanAdvice(input({ snapshot: leanSnapshot(), preference: 'isk' })));
    const haul = temperate(
      buildPlanAdvice(input({ snapshot: leanSnapshot(), preference: 'haul' }))
    );
    if (isk.rebuild.status === 'refused' || haul.rebuild.status === 'refused') throw new Error('x');
    expect(haul.rebuild.best!.m3PerDay).toBeLessThanOrEqual(isk.rebuild.best!.m3PerDay);
    expect(haul.rebuild.best!.iskPerDay).toBeLessThanOrEqual(isk.rebuild.best!.iskPerDay);
  });

  it('puts an upgrade first when the recipe needs a higher Command Center the pilot has trained', () => {
    const colony = temperate(
      buildPlanAdvice(
        input({
          snapshot: leanSnapshot(1),
          skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: 3 },
        })
      )
    );
    if (colony.rebuild.status !== 'change') throw new Error('expected a change');
    expect(colony.rebuild.upgradeFromLevel).toBe(1);
    expect(colony.rebuild.steps[0]).toMatchObject({ verb: 'upgrade', fromLevel: 1 });
    expect(colony.rebuild.pick.needsCcLevel).toBeGreaterThan(1);
    expect(colony.rebuild.pick.needsCcLevel).toBeLessThanOrEqual(5);
  });

  it('offers no upgrade a pilot has not trained for, or whose skill never loaded', () => {
    for (const trained of [null, 1]) {
      const colony = temperate(
        buildPlanAdvice(
          input({
            snapshot: leanSnapshot(1),
            skills: { commandCenterUpgrades: trained, interplanetaryConsolidation: 3 },
          })
        )
      );
      expect(colony.rebuild).toMatchObject({ status: 'keep', reason: 'no-candidates' });
    }
  });

  it('refuses a rebuild for a colony it cannot measure, and says why', () => {
    const oceanic = buildPlanAdvice(input()).colonies.find((c) => c.planetId === OCEANIC_ID)!;
    expect(oceanic.rebuild).toMatchObject({ status: 'refused' });
  });
});

describe('buildPlanAdvice: hauling, slots, ranking', () => {
  it('turns m3 a day into a trip at the pilot cadence and counts lowsec jumps to the market', () => {
    const advice = buildPlanAdvice(
      input({
        routesBySystem: new Map([
          [
            HIGHSEC_SYSTEM,
            [
              { systemId: HIGHSEC_SYSTEM, security: 0.95 },
              { systemId: 2, security: 0.3 },
              { systemId: 3, security: 0.9 },
            ],
          ],
          [NULLSEC_SYSTEM, null],
        ]),
      })
    );
    expect(advice.haul.tripsPerWeek).toBe(7);
    expect(advice.haul.m3PerTrip).toBeGreaterThan(0);
    expect(advice.haul.fit).not.toBeNull();
    // The nullsec colony's route did not resolve: the exposure is unknown, not zero.
    expect(advice.haul.route).toEqual({ kind: 'unknown' });
    const solo = buildPlanAdvice(
      input({
        snapshot: snapshot({
          colonies: [planet(TEMPERATE_ID, HIGHSEC_SYSTEM, 'temperate')],
        }),
        routesBySystem: new Map([
          [
            HIGHSEC_SYSTEM,
            [
              { systemId: HIGHSEC_SYSTEM, security: 0.95 },
              { systemId: 2, security: 0.3 },
              { systemId: 3, security: 0.9 },
            ],
          ],
        ]),
      })
    );
    expect(solo.haul.route).toMatchObject({ kind: 'route', jumps: 2, lowsec: 1, nullsec: 0 });
  });

  it('counts colonies used against the planets the skill allows, and the gain a new one adds', () => {
    const advice = buildPlanAdvice(input());
    expect(advice.slots).toMatchObject({ used: 3, allowed: 4, free: 1, assumed: false });
    expect(advice.slots.gainPerPlanetPerDay).toBe(advice.recipes.bestAnywherePerDay);
    expect(advice.slots.gainPerPlanetPerDay).toBeGreaterThan(0);
  });

  it('says the planet cap is assumed when the skill never loaded', () => {
    const advice = buildPlanAdvice(
      input({ skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: null } })
    );
    expect(advice.slots).toMatchObject({ allowed: 1, assumed: true, free: 0 });
  });

  it('ranks one-planet recipes for a pilot with no colonies, from the typed fallback rate', () => {
    const advice = buildPlanAdvice(
      input({
        snapshot: snapshot({ colonies: [], details: new Map() }),
        skills: { commandCenterUpgrades: null, interplanetaryConsolidation: null },
      })
    );
    expect(advice.colonies).toEqual([]);
    expect(advice.recipes.recipes.length).toBeGreaterThan(10);
    expect(advice.recipes.recipes.every((r) => r.tier === 1 || r.tier === 2)).toBe(true);
    expect(advice.rankingBasis).toMatchObject({
      rateSource: 'assumed',
      ccAssumed: true,
      linkCost: 'assumed',
    });
    expect(advice.totals.todayPerDay).toBeNull();
  });

  it('ranks P2 one-planet recipes for a pilot with no colonies at CCU 5 (Coolant on gas)', () => {
    const COOLANT = 9832;
    const advice = buildPlanAdvice(
      input({
        snapshot: snapshot({ colonies: [], details: new Map() }),
        skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: null },
      })
    );
    const coolant = advice.recipes.recipes.find((r) => r.typeId === COOLANT);
    expect(coolant?.tier).toBe(2);
    expect(coolant?.hostTypes).toContain('gas');
    expect(advice.recipes.recipes.filter((r) => r.tier === 2).length).toBeGreaterThan(0);
  });

  it('keeps over-budget setups in the rows, tagged with the lowest Command Center level that hosts them', () => {
    const noColonies = { snapshot: snapshot({ colonies: [], details: new Map() }) };
    const low = buildPlanAdvice(
      input({
        ...noColonies,
        skills: { commandCenterUpgrades: 0, interplanetaryConsolidation: null },
      })
    );
    const tagged = low.recipeRows.filter((r) => r.needsCcLevel !== undefined);
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((r) => r.needsCcLevel! > 0 && r.needsCcLevel! <= 5)).toBe(true);
    expect(tagged.some((r) => r.tier === 2)).toBe(true);
    // The shared ranking (Plan, Map) stays within the trained skill.
    expect(low.recipes.recipes.every((r) => r.needsCcLevel === undefined)).toBe(true);
    expect(low.recipes.recipes).toEqual([]);
    expect(low.recipes.bestAnywherePerDay).toBeNull();

    const high = buildPlanAdvice(
      input({
        ...noColonies,
        skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: null },
      })
    );
    expect(high.recipeRows.some((r) => r.needsCcLevel !== undefined)).toBe(false);
  });

  it('filters the ranking and marks the planet types the pilot has', () => {
    const p2 = buildPlanAdvice(input({ recipeFilter: 'p2' })).recipes.recipes;
    expect(p2.length).toBeGreaterThan(0);
    expect(p2.every((r) => r.tier === 2)).toBe(true);
    const anything = buildPlanAdvice(input()).recipes.recipes;
    const mine = anything.find((r) => r.haveTypes.includes('temperate'));
    expect(mine).toBeDefined();
  });

  it('unlocks recipes for a what-if planet type', () => {
    const base = buildPlanAdvice(input({ whatIfTypes: [] })).recipes.recipes;
    const withLava = buildPlanAdvice(input({ whatIfTypes: ['lava'] })).recipes.recipes;
    const lavaOnly = (list: typeof base) => list.filter((r) => r.haveTypes.includes('lava'));
    expect(lavaOnly(base)).toHaveLength(0);
    expect(lavaOnly(withLava).length).toBeGreaterThan(0);
  });

  it("carries each recipe's layout and every ranked row for re-ranking", () => {
    const advice = buildPlanAdvice(input());
    expect(advice.recipeRows.length).toBeGreaterThanOrEqual(advice.recipes.recipes.length);
    for (const recipe of advice.recipes.recipes) {
      expect(recipe.layout).toBeDefined();
      expect(recipe.layout?.extracts.length).toBeGreaterThan(0);
      expect(recipe.layout?.makes.at(-1)?.typeId).toBe(recipe.typeId);
      expect(recipe.layout?.pins.extractorControlUnit).toBeGreaterThan(0);
      expect(recipe.layout?.unitsPerDay).toBeGreaterThan(0);
    }
  });

  it('shows the same figures as the standalone ranker for the same rows', () => {
    // The ranking is exactly rankRecipes over the model's rows: Map and Plan share one number.
    const advice = buildPlanAdvice(input());
    const again = rankRecipes({
      rows: advice.recipes.recipes.map((r) => ({
        typeId: r.typeId,
        name: r.name,
        tier: r.tier,
        planetType: r.useType,
        iskPerDay: r.iskPerDay,
        m3PerDay: r.m3PerDay,
      })),
      haveTypes: ['temperate', 'oceanic', 'gas'],
      filter: 'any',
    });
    expect(again.recipes.map((r) => r.typeId)).toEqual(advice.recipes.recipes.map((r) => r.typeId));
  });
});

describe('buildPlanAdvice: more quick wins', () => {
  const BACTERIA_SCHEMATIC = pi.schematics['2393'].schematicId;

  it('finds spare room for another extractor on a one-resource colony, priced', () => {
    const oneEcu: CharacterPlanetDetail = {
      pins: [ecuPin(1, MICROORGANISMS, 7, 70, 3_000), pin(3, LAUNCHPAD), pin(4, BASIC)],
      links: [
        { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
        { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
      ],
      routes: [],
    };
    const colony = temperate(
      buildPlanAdvice(
        input({
          snapshot: snapshot({
            colonies: [{ ...planet(TEMPERATE_ID, HIGHSEC_SYSTEM, 'temperate'), upgrade_level: 5 }],
            details: new Map([[TEMPERATE_ID, oneEcu]]),
          }),
        })
      )
    );
    const room = colony.quickWins.find((win) => win.id === `${TEMPERATE_ID}:room-extractors`);
    expect(room?.detail).toMatchObject({ kind: 'spare-room', what: 'extractors', extraEcus: 1 });
    expect(room?.gainPerDay).toBeGreaterThan(0);
  });

  it('finds idle factories nothing feeds', () => {
    const factory = (pinId: number): PlanetPin => ({
      ...pin(pinId, BASIC),
      factory_details: { schematic_id: BACTERIA_SCHEMATIC },
    });
    const idle: CharacterPlanetDetail = {
      pins: [
        ecuPin(1, MICROORGANISMS, 7, 70, 3_000),
        pin(3, LAUNCHPAD),
        factory(4),
        factory(5),
        factory(6),
        factory(7),
      ],
      links: [
        { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
        { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
      ],
      routes: [],
    };
    const colony = temperate(
      buildPlanAdvice(input({ snapshot: snapshot({ details: new Map([[TEMPERATE_ID, idle]]) }) }))
    );
    const win = colony.quickWins.find((w) => w.id === `${TEMPERATE_ID}:idle`);
    expect(win?.detail).toMatchObject({ kind: 'idle-factories' });
    expect((win!.detail as { pinCount: number }).pinCount).toBeGreaterThan(0);
  });

  it('keeps a win the model cannot price, with no gain, rather than dropping it or zeroing it', () => {
    const idle: CharacterPlanetDetail = {
      pins: [
        ecuPin(1, MICROORGANISMS, 7, 70, 3_000),
        pin(3, LAUNCHPAD),
        ...[4, 5, 6, 7].map((id) => ({
          ...pin(id, BASIC),
          factory_details: { schematic_id: BACTERIA_SCHEMATIC },
        })),
      ],
      links: [{ source_pin_id: 3, destination_pin_id: 1, link_level: 0 }],
      routes: [],
    };
    const { quickWins } = buildPlanAdvice(
      input({ snapshot: snapshot({ details: new Map([[TEMPERATE_ID, idle]]) }) })
    );
    for (const win of quickWins) {
      expect(win.gainPerDay === null || win.gainPerDay > 0).toBe(true);
    }
  });

  it('finds room for a factory fed by another colony’s surplus, and names where it comes from', () => {
    const AQUEOUS_LIQUIDS = 2268;
    const WATER_SCHEMATIC = pi.schematics['3645'].schematicId;
    const factory = (pinId: number, schematic: number): PlanetPin => ({
      ...pin(pinId, BASIC),
      factory_details: { schematic_id: schematic },
    });
    const links = (ids: number[]) =>
      ids.map((id) => ({ source_pin_id: 3, destination_pin_id: id, link_level: 0 }));
    // One colony makes Bacteria, the other Water: no single colony can make Test Cultures.
    const makesBacteria: CharacterPlanetDetail = {
      pins: [
        ecuPin(1, MICROORGANISMS, 5, 70, 6_000),
        pin(3, LAUNCHPAD),
        factory(4, BACTERIA_SCHEMATIC),
        factory(5, BACTERIA_SCHEMATIC),
      ],
      links: links([1, 4, 5]),
      routes: [],
    };
    const makesWater: CharacterPlanetDetail = {
      pins: [
        ecuPin(1, AQUEOUS_LIQUIDS, 5, 70, 6_000),
        pin(3, LAUNCHPAD),
        factory(4, WATER_SCHEMATIC),
        factory(5, WATER_SCHEMATIC),
      ],
      links: links([1, 4, 5]),
      routes: [],
    };
    const advice = buildPlanAdvice(
      input({
        snapshot: snapshot({
          colonies: [
            { ...planet(TEMPERATE_ID, HIGHSEC_SYSTEM, 'temperate'), upgrade_level: 5 },
            { ...planet(OCEANIC_ID, HIGHSEC_SYSTEM, 'oceanic'), upgrade_level: 5 },
          ],
          details: new Map([
            [TEMPERATE_ID, makesBacteria],
            [OCEANIC_ID, makesWater],
          ]),
        }),
      })
    );
    const factoryWins = advice.quickWins.filter((win) => win.id.includes(':room-factories:'));
    expect(factoryWins.length).toBeGreaterThan(0);
    for (const win of factoryWins) {
      expect(win.gainPerDay).toBeGreaterThan(0);
      expect(win.detail).toMatchObject({ kind: 'spare-room', what: 'factories' });
    }
    expect(
      factoryWins.some(
        (win) =>
          win.detail.kind === 'spare-room' &&
          win.detail.what === 'factories' &&
          win.detail.routedFrom.length > 0
      )
    ).toBe(true);
  });
});

describe('planColonyAnchor', () => {
  it('slugs the planet name into a stable fragment', () => {
    expect(planColonyAnchor('Hek VIII', 1)).toBe('plan-hek-viii');
    expect(planColonyAnchor('Uttindar II', 1)).toBe('plan-uttindar-ii');
  });

  it('falls back to the planet id when there is no name', () => {
    expect(planColonyAnchor(null, 40000001)).toBe('plan-planet-40000001');
    expect(planColonyAnchor('***', 7)).toBe('plan-planet-7');
  });
});

describe('customs parity across Plan, Colonies and Map', () => {
  const planPrefs = { restartHours: 72, fallbackRatePerHour: 12_000 };
  const disabled = new Set<number>();

  it.each([
    ['no overrides', {}],
    ['an override on the nullsec system', { [NULLSEC_SYSTEM]: 0.17 }],
    ['a zero override on the nullsec system', { [NULLSEC_SYSTEM]: 0 }],
  ])('costs every colony at the rate Plan does: %s', (_label, customsOverrides) => {
    const snap = snapshot();
    const plan = plannerColonies(snap, { ...planPrefs, customsOverrides, disabled });
    const advice = buildPlanAdvice(
      input({ snapshot: snap, prefs: { ...planPrefs, customsOverrides } })
    );
    for (const row of plan) {
      const colony = advice.colonies.find((c) => c.planetId === row.planetId);
      if (!colony) continue;
      expect(colony.taxRate).toBe(row.taxRate);
      expect(colony.taxAssumed).toBe(row.taxAssumed);
    }
    expect(advice.colonies.length).toBeGreaterThan(0);
  });

  it('assumes the shared rate for an unset nullsec colony and flags it', () => {
    const advice = buildPlanAdvice(input());
    const nullsec = advice.colonies.find((c) => c.planetId === OCEANIC_ID)!;
    expect(nullsec.taxRate).toBe(ASSUMED_UNKNOWN_CUSTOMS);
    expect(nullsec.taxAssumed).toBe(true);
    expect(temperate(advice).taxAssumed).toBe(false);
  });
});
