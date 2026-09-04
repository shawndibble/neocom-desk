/**
 * A `PiData` stub for tests that only care about the recipe graph.
 *
 * `PiData` also carries the colony's CPU/Powergrid budget and the planet-type
 * map, which a test about (say) an item's recipe row has no opinion about.
 * Rather than have every such fixture restate a pin-cost table it will never
 * read — or have the shape go optional and force a `?.` at every real call
 * site — this fills those blocks in with the shipped values and lets a test
 * override whatever it does care about.
 *
 * A test that is *about* the budget numbers should not use this: see
 * `engine/pi/pinBudget.test.ts`, which asserts the real payload against the
 * researched figures directly.
 */

import type { PiData, PiInfrastructure } from '../types';

const INFRASTRUCTURE: PiInfrastructure = {
  pins: {
    extractorControlUnit: { cpu: 400, powergrid: 2_600, capacity: 0 },
    basic: { cpu: 200, powergrid: 800, capacity: 0 },
    advanced: { cpu: 500, powergrid: 700, capacity: 0 },
    highTech: { cpu: 1_100, powergrid: 400, capacity: 0 },
    storage: { cpu: 500, powergrid: 700, capacity: 12_000 },
    launchpad: { cpu: 3_600, powergrid: 700, capacity: 10_000 },
  },
  // The Temperate variant of each pin, enough for a fixture to name one.
  pinKindByTypeId: {
    3068: 'extractorControlUnit',
    2481: 'basic',
    2480: 'advanced',
    2482: 'highTech',
    2562: 'storage',
    2256: 'launchpad',
  },
  // Temperate and Barren; the real payload carries all eight.
  commandCenterTypeIds: [2254, 2524],
  extractorHead: { cpu: 110, powergrid: 550 },
  commandCenterUpgrades: [
    { level: 0, cpu: 1_675, powergrid: 6_000 },
    { level: 1, cpu: 7_057, powergrid: 9_000 },
    { level: 2, cpu: 12_136, powergrid: 12_000 },
    { level: 3, cpu: 17_215, powergrid: 15_000 },
    { level: 4, cpu: 21_315, powergrid: 17_000 },
    { level: 5, cpu: 25_415, powergrid: 19_000 },
  ],
};

const PLANET_TYPE_BY_TYPE_ID: PiData['planetTypeByTypeId'] = {
  11: 'temperate',
  12: 'ice',
  13: 'gas',
  2014: 'oceanic',
  2015: 'lava',
  2016: 'barren',
  2017: 'storm',
  2063: 'plasma',
};

export function piFixture(overrides: Partial<PiData> = {}): PiData {
  return {
    schematics: {},
    raw: [],
    infrastructure: INFRASTRUCTURE,
    planetTypeByTypeId: PLANET_TYPE_BY_TYPE_ID,
    ...overrides,
  };
}
