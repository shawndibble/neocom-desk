/**
 * Test-only builders for the goal planner's steps: the real `pi.json`, a
 * colony yielding every P0 its planet type can, and a plain policy. Excluded
 * from the build typecheck by name (`tsconfig.build.json`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { Goal, PlannerColony, PlannerPolicy, PlanetType } from '../goalTypes';

export const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

export const BASE_METALS = 2267;
export const AQUEOUS_LIQUIDS = 2268;
export const REACTIVE_METALS = 2398;
export const WATER = 3645;
export const COOLANT = 9832;
export const WATER_COOLED_CPU = 2328;
export const WETWARE_MAINFRAME = 2876;

export const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};

/** A colony yielding every P0 its planet type can, at `rate` per ECU. */
export function colony(
  planetId: number,
  planetType: PlanetType,
  cc = 5,
  rate = 6000
): PlannerColony {
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

/** A goal at `perHour`, expressed per day the way the pilot types it. */
export const goal = (typeId: number, perHour: number): Goal => ({
  typeId,
  unitsPerDay: perHour * 24,
});
