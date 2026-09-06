import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { PlanetAdvice } from './advisorModel';
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
const PLASMOIDS = 2389;
const SUPERCONDUCTORS = 9838;

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

describe('conversions', () => {
  /**
   * Plasmoids priced so a market-fed Superconductors factory is reachable —
   * the replacement has to come from somewhere, and nothing in this pair makes
   * a second P1. Kept local: adding it to the shared map would outrank Test
   * Cultures and change what the suite above is about.
   */
  const WITH_PLASMOIDS = { ...PRICES, [PLASMOIDS]: 600.2, [SUPERCONDUCTORS]: 11_280 };
  const input = {
    advice: PAIR,
    pi,
    prices: WITH_PLASMOIDS,
    taxRate: 0,
    // The replacement is a market-fed factory, so these are about the
    // opt-in state; the default-off behaviour is covered in the engine.
    allowMarketSourcing: true,
  };

  /**
   * Both colonies nearly full, which is what makes the question interesting:
   * with room to spare the allocation simply builds on the free budget and
   * nothing needs replacing. Here the set can host one Advanced pin apiece
   * against 320 Water an hour, so most of that Water has nowhere to go and the
   * eight fed pins making it are holding budget worth more to something else.
   */
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
    // Not a count of pins: the exchange is only honest if what is given up is
    // valued the same way as what replaces it.
    const colonies = networkColonies(crampedInput);
    const water = colonies.find((colony) => colony.planetId === 2);
    expect(water?.convertible).toHaveLength(1);
    expect(water?.convertible?.[0].count).toBe(8);
    expect(water?.convertible?.[0].outputTypeId).toBe(WATER);
    // 40 Water an hour out at 513.9, 6,000 Aqueous Liquids an hour in at 12.
    expect(water?.convertible?.[0].marginPerHour).toBeCloseTo(40 * 513.9 - 6_000 * 12, 6);
  });

  it('offers an exchange against output the allocation could not place', () => {
    const network = colonyNetwork(crampedInput);
    const conversion = network?.plan.conversions.find((entry) => entry.planetId === 2);
    expect(conversion).toBeDefined();
    expect(conversion?.removeName).toBe('Water');
    expect(conversion?.add.name).toBe('Superconductors');
    // Both halves priced as one decision.
    expect(conversion?.netPerHour).toBeCloseTo(
      (conversion?.add.marginPerHour ?? 0) - (conversion?.removeMarginPerHour ?? 0),
      6
    );
  });

  it('counts only fed pins as convertible, never starved ones', () => {
    // A starved pin makes nothing, so it has no margin to give up — and
    // `idleFacilityPlan` already offers it for removal. Counting it here would
    // offer the same pin twice under two different reasons.
    const starved: PlanetAdvice[] = [
      cramped[0],
      built(2, WATER_SCHEMATIC, AQUEOUS_LIQUIDS, 12_000, 8, {
        load: { cpu: 20_500, powergrid: 14_500 },
      }),
    ];
    const colonies = networkColonies({ ...input, advice: starved });
    const water = colonies.find((colony) => colony.planetId === 2);
    // 12,000/hr feeds two of the eight.
    expect(water?.convertible?.[0].count).toBe(2);
  });

  it('prices a fed factory’s margin at its own colony’s customs rate, not the on-screen fallback', () => {
    // Decision 20260906-144358: "only the host's [rate] is ever used" —
    // including for what a factory already there is worth, since an exchange
    // is only honest if both halves are priced on one basis.
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
    // Not the fallback's answer (taxRate 0 gives no tax delta at all) — proof
    // the colony's own rate, not the global one, drove the number above.
    expect(water?.convertible?.[0].marginPerHour).not.toBeCloseTo(40 * 513.9 - 6_000 * 12, 0);
  });

  it('says nothing about a colony with room to spare', () => {
    // The allocation builds on free budget there, so no pin needs replacing —
    // and an exchange offered where an addition would do is a demolition
    // nobody asked for.
    const roomy: PlanetAdvice[] = [
      built(1, BACTERIA_SCHEMATIC, MICROORGANISMS, 6_000, 1),
      built(2, WATER_SCHEMATIC, AQUEOUS_LIQUIDS, 48_000, 8),
    ];
    expect(colonyNetwork({ ...input, advice: roomy })?.plan.conversions).toEqual([]);
  });
});
