import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import { piTier } from '@/engine/pi/chain';
import { buildPlanAdvice, hubBooks, type PlanAdviceInput } from '../planAdviceModel';
import type { RosterColony } from '../roster';
import { buildAltAdvice } from './altAdvice';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const NOW = Date.parse('2026-10-01T00:00:00Z');
const HOUR = 3_600_000;
const SYSTEM = 30000142;
const MICROORGANISMS = 2073;
const ECU = 2848;
const LAUNCHPAD = 2256;
const BASIC = 2469;

const prices: Record<number, number> = {};
const buyPrices: Record<number, number> = {};
for (const raw of pi.raw) {
  prices[raw.typeID] = 5;
  buyPrices[raw.typeID] = 4.5;
}
const byTier: Record<number, number> = { 1: 1_500, 2: 36_000, 3: 140_000, 4: 1_000_000 };
for (const key of Object.keys(pi.schematics)) {
  const typeId = Number(key);
  prices[typeId] = byTier[piTier(typeId, pi)];
  buyPrices[typeId] = prices[typeId] * 0.95;
}

const pin = (pinId: number, typeId: number): PlanetPin => ({
  pin_id: pinId,
  type_id: typeId,
  latitude: 0.3 * pinId,
  longitude: 0.5,
});
const ecu = (pinId: number): PlanetPin => ({
  pin_id: pinId,
  type_id: ECU,
  latitude: 0.1 * pinId,
  longitude: 0.2,
  install_time: new Date(NOW - 2 * HOUR).toISOString(),
  expiry_time: new Date(NOW + 70 * HOUR).toISOString(),
  extractor_details: {
    heads: Array.from({ length: 7 }, (_, i) => ({ head_id: i, latitude: 0, longitude: 0 })),
    product_type_id: MICROORGANISMS,
    qty_per_cycle: 6_000,
    cycle_time: 1800,
  },
});
const detail: CharacterPlanetDetail = {
  pins: [ecu(1), ecu(2), pin(3, LAUNCHPAD), pin(4, BASIC)],
  links: [
    { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
    { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
  ],
  routes: [],
};
const planet = (planetId: number): CharacterPlanet => ({
  solar_system_id: SYSTEM,
  planet_id: planetId,
  planet_type: 'temperate',
  owner_id: 1,
  last_update: '2026-09-30T00:00:00Z',
  upgrade_level: 4,
  num_pins: 4,
});

const OWN = 40000001;
const ALT_A = 40000002;
const ALT_B = 40000003;

function input(): PlanAdviceInput {
  return {
    snapshot: {
      pi,
      nowMs: NOW,
      colonies: [planet(OWN)],
      details: new Map([[OWN, detail]]),
      planetRadiusKm: new Map([
        [OWN, 5_000],
        [ALT_A, 5_000],
        [ALT_B, 5_000],
      ]),
      securityBySystem: new Map([[SYSTEM, 0.95]]),
      customsSkill: 4,
    },
    prefs: { restartHours: 72, fallbackRatePerHour: 12_000, customsOverrides: {} },
    books: hubBooks({ prices, buyPrices, failed: false } as never, 5),
    market: { kind: 'hub' },
    cadence: { restartDays: 3, haulDays: 1 },
    preference: 'isk',
    recipeFilter: 'any',
    skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: 3 },
  };
}

const rosterColony = (
  characterId: number,
  planetId: number,
  d: CharacterPlanetDetail | null = detail
): RosterColony => ({
  characterId,
  characterName: `Alt ${characterId}`,
  planet: planet(planetId),
  detail: d,
  oldestFetchedAt: new Date(NOW),
});

describe('buildAltAdvice', () => {
  it("gives each alt's colony its own ISK a day, grouped by character", () => {
    const result = buildAltAdvice(input(), [
      rosterColony(7, ALT_A),
      rosterColony(7, ALT_B),
      rosterColony(8, ALT_A),
    ]);
    expect([...result.keys()].sort()).toEqual([7, 8]);
    const seven = result.get(7)!;
    expect(seven.byPlanetId.get(ALT_A)!.todayPerDay).toBeGreaterThan(0);
    expect(seven.makesPerDay).toBeCloseTo(
      seven.byPlanetId.get(ALT_A)!.todayPerDay! + seven.byPlanetId.get(ALT_B)!.todayPerDay!,
      6
    );
  });

  it('has no figure, not zero, for an alt colony whose detail is not cached', () => {
    const result = buildAltAdvice(input(), [rosterColony(7, ALT_A, null)]);
    expect(result.get(7)!.byPlanetId.size).toBe(0);
    expect(result.get(7)!.makesPerDay).toBeNull();
  });

  it("prices with no alt skills: never the active Character's customs or tax", () => {
    const own = input();
    const alt = buildAltAdvice(own, [rosterColony(7, ALT_A)]).get(7)!;
    const asActive = buildPlanAdvice({
      ...own,
      snapshot: {
        ...own.snapshot,
        colonies: [planet(ALT_A)],
        details: new Map([[ALT_A, detail]]),
      },
    });
    expect(alt.makesPerDay!).toBeLessThan(asActive.totals.todayPerDay!);
  });

  it("never changes the active Character's plan totals", () => {
    const own = input();
    const before = buildPlanAdvice(own).totals;
    buildAltAdvice(own, [rosterColony(7, ALT_A), rosterColony(8, ALT_B)]);
    expect(buildPlanAdvice(own).totals).toEqual(before);
    expect(own.snapshot.colonies).toHaveLength(1);
    expect(own.snapshot.details.size).toBe(1);
  });
});
