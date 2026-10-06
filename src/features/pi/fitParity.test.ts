/**
 * One fit source (issue #2768): for every recipe the ranking offers, the "needs
 * CC level N" tag, Show me how's Command Center line and its CPU/Power meter
 * all read the same fit, the ranking's own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import { piTier } from '@/engine/pi/chain';
import type { PiCadence } from './cadencePref';
import { colonyBudget } from './colonyBudget';
import { buildHowTo } from './findBestHowTo';
import { buildPlanAdvice, hubBooks, type PlanAdvice } from './planAdviceModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const NOW = Date.parse('2026-10-01T00:00:00Z');
const HOUR = 3_600_000;
const NULLSEC_SYSTEM = 30004759;
const ECU = 2848;
const LAUNCHPAD = 2256;
const STORAGE = 2257;
const BASIC = 2469;

function prices(): { prices: Record<number, number>; buyPrices: Record<number, number> } {
  const sell: Record<number, number> = {};
  const buy: Record<number, number> = {};
  for (const raw of pi.raw) {
    sell[raw.typeID] = 5;
    buy[raw.typeID] = 4.5;
  }
  const byTier: Record<number, number> = { 1: 1_500, 2: 36_000, 3: 140_000, 4: 1_000_000 };
  for (const key of Object.keys(pi.schematics)) {
    const typeId = Number(key);
    const base = byTier[piTier(typeId, pi)];
    sell[typeId] = base + (typeId % 7) * (base / 100);
    buy[typeId] = sell[typeId] * 0.95;
  }
  return { prices: sell, buyPrices: buy };
}

function ecu(pinId: number, product: number, heads: number): PlanetPin {
  return {
    pin_id: pinId,
    type_id: ECU,
    latitude: 1.5 + 0.02 * pinId,
    longitude: 0.2,
    install_time: new Date(NOW - 2 * HOUR).toISOString(),
    expiry_time: new Date(NOW + 70 * HOUR).toISOString(),
    extractor_details: {
      heads: Array.from({ length: heads }, (_, i) => ({ head_id: i, latitude: 0, longitude: 0 })),
      product_type_id: product,
      qty_per_cycle: 6_000,
      cycle_time: 1800,
    },
  };
}

const pin = (pinId: number, typeId: number): PlanetPin => ({
  pin_id: pinId,
  type_id: typeId,
  latitude: 1.5 + 0.03 * pinId,
  longitude: 0.5,
});

/** A nullsec extraction colony: two eight-head ECUs on one P0, a pad, a silo, a factory. */
function extractionColony(product: number): CharacterPlanetDetail {
  return {
    pins: [
      ecu(1, product, 8),
      ecu(2, product, 8),
      pin(3, LAUNCHPAD),
      pin(4, STORAGE),
      pin(5, BASIC),
    ],
    links: [
      { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
      { source_pin_id: 3, destination_pin_id: 2, link_level: 0 },
      { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
      { source_pin_id: 3, destination_pin_id: 5, link_level: 0 },
    ],
    routes: [],
  };
}

function planet(planetId: number, type: CharacterPlanet['planet_type']): CharacterPlanet {
  return {
    solar_system_id: NULLSEC_SYSTEM,
    planet_id: planetId,
    planet_type: type,
    owner_id: 1,
    last_update: '2026-09-30T00:00:00Z',
    upgrade_level: 4,
    num_pins: 5,
  };
}

function advise(opts: {
  colonies: boolean;
  ccu: number | null;
  haulDays: PiCadence['haulDays'];
}): PlanAdvice {
  const colonies = opts.colonies
    ? [planet(1, 'barren'), planet(2, 'gas'), planet(3, 'temperate')]
    : [];
  const details = opts.colonies
    ? new Map([
        [1, extractionColony(2267)],
        [2, extractionColony(2309)],
        [3, extractionColony(2268)],
      ])
    : new Map<number, CharacterPlanetDetail>();
  return buildPlanAdvice({
    snapshot: {
      pi,
      nowMs: NOW,
      colonies,
      details,
      planetRadiusKm: new Map([
        [1, 5_000],
        [2, 30_000],
        [3, 6_000],
      ]),
      securityBySystem: new Map([[NULLSEC_SYSTEM, -0.4]]),
      customsSkill: 4,
    },
    prefs: { restartHours: 72, fallbackRatePerHour: 12_000, customsOverrides: {} },
    books: hubBooks(prices(), 5),
    market: { kind: 'hub' },
    cadence: { restartDays: 3, haulDays: opts.haulDays },
    preference: 'isk',
    recipeFilter: 'any',
    skills: { commandCenterUpgrades: opts.ccu, interplanetaryConsolidation: 3 },
  });
}

/** Tag, Show me how's level and the meter's budget, recipe by recipe. */
function expectOneFitSource(advice: PlanAdvice): void {
  const { recipes } = advice.recipesWithTagged;
  expect(recipes.length).toBeGreaterThan(0);
  for (const recipe of recipes) {
    const fit = buildHowTo(recipe, pi)?.fit;
    expect(fit, recipe.name).toBeDefined();
    expect(fit, recipe.name).not.toBeNull();
    if (!fit) continue;
    if (recipe.needsCcLevel) {
      expect(fit.level, recipe.name).toBe(recipe.needsCcLevel);
    } else {
      expect(fit.level, recipe.name).toBeLessThanOrEqual(advice.rankingBasis.ccLevel);
    }
    expect(fit.budget, recipe.name).toEqual(colonyBudget(fit.level, pi).budget);
    expect(fit.used.cpu, recipe.name).toBeLessThanOrEqual(fit.budget.cpu);
    expect(fit.used.powergrid, recipe.name).toBeLessThanOrEqual(fit.budget.powergrid);
  }
}

describe('one fit source: tag, Show me how and the meter agree', () => {
  it.each([
    ['untrained', 0],
    ['CCU 4', 4],
    ['skills not loaded', null],
  ])('a pilot with no colonies, %s', (_label, ccu) => {
    const advice = advise({ colonies: false, ccu, haulDays: 1 });
    expectOneFitSource(advice);
    // P2 gets its Command Center line and meter too.
    expect(advice.recipesWithTagged.recipes.some((r) => r.tier === 2)).toBe(true);
  });

  it('a new pilot: the tag and Show me how name the same level for Plasmoids', () => {
    const PLASMOIDS = 2389;
    const advice = advise({ colonies: false, ccu: 0, haulDays: 1 });
    const plasmoids = advice.recipesWithTagged.recipes.find((r) => r.typeId === PLASMOIDS)!;
    expect(plasmoids.needsCcLevel).toBe(1);
    expect(buildHowTo(plasmoids, pi)?.fit?.level).toBe(1);
  });

  it.each([1, 7] as const)('nullsec colonies at CC 4, hauling every %i days', (haulDays) => {
    const advice = advise({ colonies: true, ccu: 4, haulDays });
    expect(advice.rankingBasis).toMatchObject({ ccLevel: 4, linkCost: 'borrowed' });
    expectOneFitSource(advice);
  });

  it('nullsec colonies at CC 4: a P2 is not pushed to level 5 by the heads their P0 colonies run', () => {
    const advice = advise({ colonies: true, ccu: 4, haulDays: 1 });
    const p2 = advice.recipesWithTagged.recipes.filter((r) => r.tier === 2);
    expect(p2.length).toBeGreaterThan(0);
    expect(p2.every((r) => r.needsCcLevel === undefined)).toBe(true);
    // The heads the layout assumes are named, so the pilot can build what the meter reads.
    for (const recipe of p2) {
      const heads = recipe.layout?.headsPerExtractor ?? 0;
      expect(heads).toBeGreaterThanOrEqual(1);
      expect(heads).toBeLessThan(8);
    }
    // P1 keeps the pilot's own measured head count.
    const p1 = advice.recipesWithTagged.recipes.filter((r) => r.tier === 1);
    expect(p1.every((r) => r.layout?.headsPerExtractor === 8)).toBe(true);
  });
});
