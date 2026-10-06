/**
 * Test-only fixtures for the Map: a real `pi.json`, deterministic prices and a
 * small colony set, built the way `planAdviceModel.test.ts` builds its own, so
 * a test can run the real `buildPlanAdvice` without fetching anything.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import { hubBooks, type PlanAdviceInput } from '../planAdviceModel';
import type { PlannerSnapshot } from '../goalPlannerModel';

export const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const NOW = Date.parse('2026-10-01T00:00:00Z');
const HOUR = 3_600_000;
export const HIGHSEC_SYSTEM = 30000142;
export const TEMPERATE_ID = 40000001;
export const OCEANIC_ID = 40000002;

function prices() {
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
export const PRICES = prices();

function ecuPin(pinId: number, product: number, qty: number): PlanetPin {
  return {
    pin_id: pinId,
    type_id: 2848,
    latitude: 0.1 * pinId,
    longitude: 0.2,
    install_time: new Date(NOW - 2 * HOUR).toISOString(),
    expiry_time: new Date(NOW + 70 * HOUR).toISOString(),
    extractor_details: {
      heads: Array.from({ length: 7 }, (_, i) => ({ head_id: i, latitude: 0, longitude: 0 })),
      product_type_id: product,
      qty_per_cycle: qty,
      cycle_time: 1800,
    },
  };
}

const pad = (pinId: number, typeId: number): PlanetPin => ({
  pin_id: pinId,
  type_id: typeId,
  latitude: 0.3 * pinId,
  longitude: 0.5,
});

function planet(
  planetId: number,
  type: CharacterPlanet['planet_type'],
  level = 4
): CharacterPlanet {
  return {
    solar_system_id: HIGHSEC_SYSTEM,
    planet_id: planetId,
    planet_type: type,
    owner_id: 1,
    last_update: '2026-09-30T00:00:00Z',
    upgrade_level: level,
    num_pins: 4,
  };
}

/** A lean temperate colony (3,000 a cycle): refining beats selling the ore, so Plan has a rebuild. */
const leanDetail: CharacterPlanetDetail = {
  pins: [ecuPin(1, 2073, 3_000), ecuPin(2, 2073, 3_000), pad(3, 2256), pad(4, 2469)],
  links: [
    { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
    { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
  ],
  routes: [],
};

export function snapshot(colonies: 'lean' | 'none' = 'lean'): PlannerSnapshot {
  return {
    pi,
    nowMs: NOW,
    colonies: colonies === 'lean' ? [planet(TEMPERATE_ID, 'temperate')] : [],
    details: colonies === 'lean' ? new Map([[TEMPERATE_ID, leanDetail]]) : new Map(),
    planetRadiusKm: new Map([[TEMPERATE_ID, 5_000]]),
    securityBySystem: new Map([[HIGHSEC_SYSTEM, 0.95]]),
    customsSkill: 4,
  };
}

/**
 * Bacteria (the P1 made from this colony's Microorganisms) priced under the ore
 * itself, so refining in place is no quick win and the rebuild is what Plan offers.
 */
const LEAN_PRICES = {
  prices: { ...PRICES.prices, 2393: 50 },
  buyPrices: { ...PRICES.buyPrices, 2393: 45 },
};

export function adviceInput(
  colonies: 'lean' | 'none' = 'lean',
  overrides: Partial<PlanAdviceInput> = {}
): PlanAdviceInput {
  return {
    snapshot: snapshot(colonies),
    prefs: { restartHours: 72, fallbackRatePerHour: 12_000, customsOverrides: {} },
    books: hubBooks(colonies === 'lean' ? LEAN_PRICES : PRICES, 5),
    market: { kind: 'hub' },
    cadence: { restartDays: 3, haulDays: 1 },
    preference: 'isk',
    recipeFilter: 'any',
    skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: 3 },
    planetNames: new Map([[TEMPERATE_ID, 'Hek VIII']]),
    ...overrides,
  };
}
