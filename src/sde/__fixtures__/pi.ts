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
  pinKindByTypeId: {
    3068: 'extractorControlUnit',
    2481: 'basic',
    2480: 'advanced',
    2482: 'highTech',
    2562: 'storage',
    2256: 'launchpad',
  },
  commandCenterTypeIds: [2254, 2524],
  extractorHead: { cpu: 110, powergrid: 550 },
  link: {
    cpu: 15,
    powergrid: 10,
    cpuPerKm: 0.2,
    powergridPerKm: 0.15,
    cpuLevelModifier: 1.4,
    powergridLevelModifier: 1.2,
  },
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
