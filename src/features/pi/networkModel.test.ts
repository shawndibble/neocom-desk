import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { PlanetAdvice } from './systemPlanetModel';
import { colonyNetwork, networkColonies } from './networkModel';
import { CUSTOMS_TAXABLE_VALUE, piTier } from '@/engine/pi/chain';

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
const NANITES = 2463;
const NANITES_SCHEMATIC = 78;
const PLASMOIDS = 2389;
const SUPERCONDUCTORS = 9838;

const PRICES: Record<number, number> = {
  [MICROORGANISMS]: 12,
  [AQUEOUS_LIQUIDS]: 12,
  [BACTERIA]: 490,
  [WATER]: 513.9,
  [TEST_CULTURES]: 10_000,
};

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
      stoppedExtraction: null,
      production: [{ schematicId, count: pins }],
      linkCount: 4,
      hasUnverifiedExtractors: false,
    },
  };
}

const PAIR: PlanetAdvice[] = [
  built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 30_000, 5),
  built(2, WATER_SCHEMATIC, AQUEOUS_LIQUIDS, 30_000, 5),
];

const input = { advice: PAIR, pi, prices: PRICES, taxRate: 0, salesTaxPct: 0 };

describe('networkColonies', () => {
  it('measures each colony at what its extraction actually feeds', () => {
    const colonies = networkColonies(input);
    expect(colonies).toHaveLength(2);
    expect(colonies[0].exportablePerHour.get(BACTERIA)).toBeCloseTo(200, 6);
  });

  it('routes only the material that exists, not what the pins could take', () => {
    const starved = [built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 30_000, 8), PAIR[1]];
    const colonies = networkColonies({ ...input, advice: starved });
    expect(colonies[0].exportablePerHour.get(BACTERIA)).toBeCloseTo(200, 6);
  });

  it('offers the budget the unfed factories are holding, and says it assumed that', () => {
    const starved = [built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 30_000, 8), PAIR[1]];
    const lean = networkColonies(input);
    const fat = networkColonies({ ...input, advice: starved });
    expect(fat[0].spare.powergrid - lean[0].spare.powergrid).toBeCloseTo(3 * 800, 6);
    expect(colonyNetwork({ ...input, advice: starved })?.assumesRemoval).toBe(true);
    expect(colonyNetwork(input)?.assumesRemoval).toBe(false);
  });

  it('leaves out a colony whose detail never loaded rather than calling it empty', () => {
    const unread = PAIR.map((entry, i) =>
      i === 0 && entry.kind === 'built'
        ? { ...entry, colony: { ...entry.colony, detailLoaded: false } }
        : entry
    );
    expect(networkColonies({ ...input, advice: unread })).toHaveLength(1);
  });

  it('leaves out a colony whose links could not be priced', () => {
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
    expect(colonyNetwork({ ...input, advice: [PAIR[0]] })).toBeNull();
    expect(colonyNetwork({ ...input, advice: [] })).toBeNull();
  });
});

describe('conversions', () => {
  const WITH_PLASMOIDS = { ...PRICES, [PLASMOIDS]: 600.2, [SUPERCONDUCTORS]: 11_280 };
  const input = {
    advice: PAIR,
    pi,
    prices: WITH_PLASMOIDS,
    taxRate: 0,
    salesTaxPct: 0,
    allowMarketSourcing: true,
  };

  const cramped: PlanetAdvice[] = [
    built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 6_000, 1, {
      load: { cpu: 20_400, powergrid: 16_200 },
    }),
    built(2, WATER_SCHEMATIC, AQUEOUS_LIQUIDS, 48_000, 8, {
      load: { cpu: 20_500, powergrid: 14_500 },
    }),
  ];
  const crampedInput = { ...input, advice: cramped };

  it('prices what a fed factory earns, so taking one down has a cost', () => {
    const colonies = networkColonies(crampedInput);
    const water = colonies.find((colony) => colony.planetId === 2);
    expect(water?.convertible).toHaveLength(1);
    expect(water?.convertible?.[0].count).toBe(8);
    expect(water?.convertible?.[0].outputTypeId).toBe(WATER);
    expect(water?.convertible?.[0].marginPerHour).toBeCloseTo(40 * 513.9 - 6_000 * 12, 6);
  });

  it('offers an exchange against output the allocation could not place', () => {
    const network = colonyNetwork(crampedInput);
    const conversion = network?.plan.conversions.find((entry) => entry.planetId === 2);
    expect(conversion).toBeDefined();
    expect(conversion?.removeName).toBe('Water');
    expect(conversion?.add.name).toBe('Superconductors');
    expect(conversion?.netPerHour).toBeCloseTo(
      (conversion?.add.marginPerHour ?? 0) - (conversion?.removeMarginPerHour ?? 0),
      6
    );
  });

  it('counts only fed pins as convertible, never starved ones', () => {
    const starved: PlanetAdvice[] = [
      cramped[0],
      built(2, WATER_SCHEMATIC, AQUEOUS_LIQUIDS, 12_000, 8, {
        load: { cpu: 20_500, powergrid: 14_500 },
      }),
    ];
    const colonies = networkColonies({ ...input, advice: starved });
    const water = colonies.find((colony) => colony.planetId === 2);
    expect(water?.convertible?.[0].count).toBe(2);
  });

  it('prices a fed factory’s margin at its own colony’s customs rate, not the on-screen fallback', () => {
    const colonies = networkColonies({
      ...crampedInput,
      taxRate: 0,
      taxRateByPlanet: new Map([[2, 0.1]]),
    });
    const water = colonies.find((colony) => colony.planetId === 2);
    const outputPerHour = 40;
    const inputPerHour = 6_000;
    const taxDelta =
      0.1 *
      (outputPerHour * CUSTOMS_TAXABLE_VALUE[piTier(WATER, pi)] -
        inputPerHour * CUSTOMS_TAXABLE_VALUE[piTier(AQUEOUS_LIQUIDS, pi)]);
    expect(water?.convertible?.[0].marginPerHour).toBeCloseTo(
      outputPerHour * 513.9 - inputPerHour * 12 - taxDelta,
      6
    );
    expect(water?.convertible?.[0].marginPerHour).not.toBeCloseTo(40 * 513.9 - 6_000 * 12, 0);
  });

  it('says nothing about a colony with room to spare', () => {
    const roomy: PlanetAdvice[] = [
      built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 6_000, 1),
      built(2, WATER_SCHEMATIC, AQUEOUS_LIQUIDS, 48_000, 8),
    ];
    expect(colonyNetwork({ ...input, advice: roomy })?.plan.conversions).toEqual([]);
  });
});

describe('a colony whose own factories eat what it makes', () => {
  function nanitesOverBacteria(): PlanetAdvice {
    const base = built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 6_865, 4);
    if (base.kind !== 'built') throw new Error('unreachable');
    return {
      ...base,
      colony: {
        ...base.colony,
        production: [
          { schematicId: BACTERIA_SCHEMATIC, count: 4 },
          { schematicId: NANITES_SCHEMATIC, count: 8 },
        ],
      },
    };
  }

  const withWater: PlanetAdvice[] = [nanitesOverBacteria(), PAIR[1]];

  it('has no Bacteria to offer the plan, though it makes some', () => {
    const colonies = networkColonies({ ...input, advice: withWater });
    const efa = colonies.find((colony) => colony.planetId === 1);
    expect(efa?.exportablePerHour.has(BACTERIA)).toBe(false);
    expect(efa?.exportablePerHour.get(NANITES)).toBeCloseTo(8 * 5, 6);
  });

  it('is never offered a Test Cultures facility on Bacteria it cannot spare', () => {
    const plan = colonyNetwork({ ...input, advice: withWater })?.plan;
    expect(plan?.opportunities.some((line) => line.name === 'Test Cultures')).toBe(false);
  });

  it('still places a facility when the Bacteria really is spare', () => {
    const plan = colonyNetwork({ ...input, advice: PAIR })?.plan;
    expect(plan?.opportunities.some((line) => line.name === 'Test Cultures')).toBe(true);
  });
});
