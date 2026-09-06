import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { PlanetAdvice } from './advisorModel';
import { colonyNetwork, networkColonies } from './networkModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BACTERIA = 2393;
const WATER = 3645;
const TEST_CULTURES = 2319;
const BACTERIA_SCHEMATIC = 131;
const WATER_SCHEMATIC = 121;

const PRICES: Record<number, number> = {
  [MICROORGANISMS]: 12,
  [AQUEOUS_LIQUIDS]: 12,
  [BACTERIA]: 490,
  [WATER]: 513.9,
  [TEST_CULTURES]: 10_000,
};

/**
 * A refining colony: one extractor at `extraction` units an hour feeding
 * `pins` Basic factories, on a Command Center level 4 budget.
 */
function built(
  planetId: number,
  schematicId: number,
  resource: number,
  extraction: number,
  pins: number,
  overrides: { load?: { cpu: number; powergrid: number } } = {}
): PlanetAdvice {
  return {
    kind: 'built',
    planetId,
    name: `Planet ${planetId}`,
    planetType: 'temperate',
    colony: {
      upgradeLevel: 4,
      budget: { cpu: 21_315, powergrid: 17_000 },
      lastUpdate: '2026-09-06T00:00:00Z',
      detailLoaded: true,
      pinLoad: {
        counts: { extractorControlUnit: 1, basic: pins, launchpad: 1 },
        extractorHeads: 10,
        load: overrides.load ?? { cpu: 5_000, powergrid: 8_000 },
        linkLoad: { cpu: 100, powergrid: 80 },
        newLinkLoad: { cpu: 30, powergrid: 21 },
        linkCount: 4,
        unknownTypeIds: [],
      },
      extractors: [{ pinId: 1, productTypeId: resource, ratePerHour: extraction, expiryMs: null }],
      extractedPerHour: [{ typeId: resource, unitsPerHour: extraction }],
      production: [{ schematicId, count: pins }],
      linkCount: 4,
      hasUnverifiedExtractors: false,
    },
  };
}

/** Two colonies that between them reach Test Cultures; neither reaches it alone. */
const PAIR: PlanetAdvice[] = [
  built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 30_000, 5),
  built(2, WATER_SCHEMATIC, AQUEOUS_LIQUIDS, 30_000, 5),
];

const input = { advice: PAIR, pi, prices: PRICES, taxRate: 0 };

describe('networkColonies', () => {
  it('measures each colony at what its extraction actually feeds', () => {
    // Five Basic pins wanting 30,000 P0/hr against exactly 30,000 extracted:
    // all five fed, 200 P1/hr. Sized off the built pin count it would be the
    // same here; the next test is where the two differ.
    const colonies = networkColonies(input);
    expect(colonies).toHaveLength(2);
    expect(colonies[0].outputPerHour.get(BACTERIA)).toBeCloseTo(200, 6);
  });

  it('routes only the material that exists, not what the pins could take', () => {
    // Eight pins on the same 30,000/hr feeds five. A plan sized off eight
    // would route 320 Bacteria an hour that nobody makes.
    const starved = [built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 30_000, 8), PAIR[1]];
    const colonies = networkColonies({ ...input, advice: starved });
    expect(colonies[0].outputPerHour.get(BACTERIA)).toBeCloseTo(200, 6);
  });

  it('offers the budget the unfed factories are holding, and says it assumed that', () => {
    // The join between "remove x" and "add y": three of eight pins draw
    // 600 tf / 2,400 MW and make nothing, and that is where the Advanced
    // factories go.
    const starved = [built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 30_000, 8), PAIR[1]];
    const lean = networkColonies(input);
    const fat = networkColonies({ ...input, advice: starved });
    expect(fat[0].spare.powergrid - lean[0].spare.powergrid).toBeCloseTo(3 * 800, 6);
    expect(colonyNetwork({ ...input, advice: starved })?.assumesRemoval).toBe(true);
    expect(colonyNetwork(input)?.assumesRemoval).toBe(false);
  });

  it('leaves out a colony whose detail never loaded rather than calling it empty', () => {
    // An unread colony is not an empty one, and counting it as empty would
    // route material past a planet already consuming it.
    const unread = PAIR.map((entry, i) =>
      i === 0 && entry.kind === 'built'
        ? { ...entry, colony: { ...entry.colony, detailLoaded: false } }
        : entry
    );
    expect(networkColonies({ ...input, advice: unread })).toHaveLength(1);
  });

  it('leaves out a colony whose links could not be priced', () => {
    // Same refusal the card makes: without a link cost there is no honest
    // `spare` to offer a host.
    const unpriced = PAIR.map((entry, i) =>
      i === 0 && entry.kind === 'built'
        ? {
            ...entry,
            colony: { ...entry.colony, pinLoad: { ...entry.colony.pinLoad, linkLoad: null } },
          }
        : entry
    );
    expect(networkColonies({ ...input, advice: unpriced })).toHaveLength(1);
  });

  it('never offers a negative budget on a colony that is over its own', () => {
    const over = [
      built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 30_000, 5, {
        load: { cpu: 30_000, powergrid: 30_000 },
      }),
      PAIR[1],
    ];
    const colonies = networkColonies({ ...input, advice: over });
    expect(colonies[0].spare.cpu).toBeGreaterThanOrEqual(0);
    expect(colonies[0].spare.powergrid).toBeGreaterThanOrEqual(0);
  });

  it('ignores planets with no colony on them', () => {
    const withUnbuilt: PlanetAdvice[] = [
      ...PAIR,
      { kind: 'unbuilt', planetId: 9, name: 'Planet 9', planetType: 'barren', localResources: [] },
      { kind: 'uncolonisable', planetId: 10, name: 'Planet 10', planetType: null },
    ];
    expect(networkColonies({ ...input, advice: withUnbuilt })).toHaveLength(2);
  });
});

describe('colonyNetwork', () => {
  it('plans across the colonies it could measure', () => {
    const network = colonyNetwork(input);
    expect(network?.plan.opportunities.map((line) => line.name)).toContain('Test Cultures');
  });

  it('has nothing to say about fewer than two colonies', () => {
    // One colony is the per-planet question, already answered on its own card.
    expect(colonyNetwork({ ...input, advice: [PAIR[0]] })).toBeNull();
    expect(colonyNetwork({ ...input, advice: [] })).toBeNull();
  });
});
