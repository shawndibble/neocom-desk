import { describe, it, expect } from 'vitest';
import { piFixture } from '@/sde/__fixtures__/pi';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import { systemAdvice } from './systemPlanetModel';
import { DAY_MS } from '@/lib/age';

const INSTALL = Date.parse('2026-09-01T00:00:00Z');
const NOW = INSTALL + 3 * DAY_MS;

const pi = piFixture({
  raw: [
    {
      typeID: 2073,
      name: 'Microorganisms',
      volume: 0.005,
      planetTypes: ['barren', 'ice', 'oceanic', 'temperate'],
    },
    {
      typeID: 2268,
      name: 'Aqueous Liquids',
      volume: 0.005,
      planetTypes: ['barren', 'gas', 'ice', 'oceanic', 'storm', 'temperate'],
    },
    {
      typeID: 2267,
      name: 'Base Metals',
      volume: 0.005,
      planetTypes: ['barren', 'gas', 'lava', 'plasma', 'storm'],
    },
  ],
});

function colony(planetId: number, planetType: CharacterPlanet['planet_type']): CharacterPlanet {
  return {
    solar_system_id: 30_000_001,
    planet_id: planetId,
    planet_type: planetType,
    owner_id: 1,
    last_update: '2026-09-03T00:00:00Z',
    upgrade_level: 4,
    num_pins: 3,
  };
}

function detail(
  pins: PlanetPin[],
  links: CharacterPlanetDetail['links'] = []
): CharacterPlanetDetail {
  return { links, pins, routes: [] };
}

function extractorPin(pinId: number, productTypeId: number): PlanetPin {
  return {
    pin_id: pinId,
    type_id: 3068,
    latitude: 0,
    longitude: 0,
    install_time: '2026-09-01T00:00:00Z',
    expiry_time: new Date(INSTALL + 14 * DAY_MS).toISOString(),
    extractor_details: {
      heads: [1, 2, 3, 4].map((id) => ({ head_id: id, latitude: 0, longitude: 0 })),
      cycle_time: 1_800,
      qty_per_cycle: 6_965,
      product_type_id: productTypeId,
    },
  };
}

describe('systemAdvice', () => {
  it('reads a built colony off its own pins and programs, with no estimate anywhere', () => {
    const [advice] = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_001, name: 'Ashab III', typeId: 11 }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([
          [
            40_000_001,
            detail([
              extractorPin(1, 2073),
              { pin_id: 2, type_id: 2481, latitude: 0, longitude: 0, schematic_id: 133 },
              { pin_id: 3, type_id: 2256, latitude: 0, longitude: 0 },
            ]),
          ],
        ]),
      },
      pi
    );

    expect(advice.kind).toBe('built');
    if (advice.kind !== 'built') throw new Error('unreachable');
    expect(advice.name).toBe('Ashab III');
    expect(advice.planetType).toBe('temperate');
    expect(advice.colony.pinLoad.counts).toEqual({
      extractorControlUnit: 1,
      basic: 1,
      launchpad: 1,
    });
    expect(advice.colony.pinLoad.extractorHeads).toBe(4);
    expect(advice.colony.upgradeLevel).toBe(4);
    expect(advice.colony.budget).toEqual({ cpu: 21_315, powergrid: 17_000 });
    expect(advice.colony.extractedPerHour).toEqual([
      { typeId: 2073, unitsPerHour: expect.closeTo(1_874_985 / 336, 0) },
    ]);
    expect(advice.colony.production).toEqual([{ schematicId: 133, count: 1 }]);
  });

  it('earns 0 from an extractor past its own expiry, and reports it stopped', () => {
    const stoppedAt = INSTALL + 14 * DAY_MS;
    const nowMs = stoppedAt + 5 * 3_600_000;
    const [advice] = systemAdvice(
      {
        nowMs,
        planets: [{ planetId: 40_000_001, name: 'Ashab III', typeId: 11 }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([[40_000_001, detail([extractorPin(1, 2073)])]]),
      },
      pi
    );
    if (advice.kind !== 'built') throw new Error('unreachable');
    expect(advice.colony.extractedPerHour).toEqual([]);
    expect(advice.colony.stoppedExtraction).toEqual({ count: 1, hoursStopped: 5 });
  });

  it('sums two extractors on one product rather than reporting the last one', () => {
    const [advice] = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_001, name: null, typeId: 11 }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([[40_000_001, detail([extractorPin(1, 2073), extractorPin(2, 2073)])]]),
      },
      pi
    );
    if (advice.kind !== 'built') throw new Error('unreachable');
    expect(advice.colony.extractedPerHour).toEqual([
      { typeId: 2073, unitsPerHour: expect.closeTo((2 * 1_874_985) / 336, 0) },
    ]);
  });

  it('leaves an extractor with no install-time baseline unmeasured instead of at zero', () => {
    const [advice] = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_001, name: null, typeId: 11 }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([
          [
            40_000_001,
            detail([
              {
                pin_id: 1,
                type_id: 3068,
                latitude: 0,
                longitude: 0,
                expiry_time: new Date(INSTALL + 14 * DAY_MS).toISOString(),
                extractor_details: { heads: [], product_type_id: 2073 },
              },
            ]),
          ],
        ]),
      },
      pi
    );
    if (advice.kind !== 'built') throw new Error('unreachable');
    expect(advice.colony.extractors[0].ratePerHour).toBeNull();
    expect(advice.colony.extractedPerHour).toEqual([]);
  });

  it('lists what an unbuilt planet could extract, and never a yield for it', () => {
    const [advice] = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_002, name: 'Ashab II', typeId: 2016 }],
        colonies: [],
        details: new Map(),
      },
      pi
    );
    expect(advice.kind).toBe('unbuilt');
    if (advice.kind !== 'unbuilt') throw new Error('unreachable');
    expect(advice.planetType).toBe('barren');
    expect(advice.localResources.map((r) => r.name)).toEqual([
      'Microorganisms',
      'Aqueous Liquids',
      'Base Metals',
    ]);
  });

  it('sizes each colony against its own Command Center, not one shared budget', () => {
    const advice = systemAdvice(
      {
        nowMs: NOW,
        planets: [
          { planetId: 40_000_001, name: 'Ashab III', typeId: 11 },
          { planetId: 40_000_004, name: 'Ashab IV', typeId: 2014 },
        ],
        colonies: [
          colony(40_000_001, 'temperate'),
          { ...colony(40_000_004, 'oceanic'), upgrade_level: 1 },
        ],
        details: new Map([
          [40_000_001, detail([extractorPin(1, 2073)])],
          [40_000_004, detail([extractorPin(2, 2073)])],
        ]),
      },
      pi
    );
    const budgets = advice.map((a) => (a.kind === 'built' ? a.colony.budget.powergrid : null));
    expect(budgets).toEqual([17_000, 9_000]);
  });

  it('keeps a planet whose type never resolved distinct from one that takes no colony', () => {
    const advice = systemAdvice(
      {
        nowMs: NOW,
        planets: [
          { planetId: 40_000_007, name: 'Ashab VII', typeId: null },
          { planetId: 40_000_003, name: 'Ashab X', typeId: 30_889 },
        ],
        colonies: [],
        details: new Map(),
      },
      pi
    );
    expect(advice.map((a) => a.kind)).toEqual(['unknown-type', 'uncolonisable']);
  });

  it('still types a built colony whose planet lookup failed, from ESI’s own field', () => {
    const [advice] = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_001, name: null, typeId: null }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([[40_000_001, detail([extractorPin(1, 2073)])]]),
      },
      pi
    );
    expect(advice.kind).toBe('built');
    expect(advice.planetType).toBe('temperate');
  });

  it('marks a planet no colony can be placed on rather than calling it unbuilt', () => {
    const [advice] = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_003, name: 'Ashab X', typeId: 30_889 }],
        colonies: [],
        details: new Map(),
      },
      pi
    );
    expect(advice.kind).toBe('uncolonisable');
  });

  it('puts built colonies first, so the planets with real numbers lead', () => {
    const advice = systemAdvice(
      {
        nowMs: NOW,
        planets: [
          { planetId: 40_000_002, name: 'Ashab II', typeId: 2016 },
          { planetId: 40_000_003, name: 'Ashab X', typeId: 30_889 },
          { planetId: 40_000_001, name: 'Ashab III', typeId: 11 },
        ],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([[40_000_001, detail([extractorPin(1, 2073)])]]),
      },
      pi
    );
    expect(advice.map((a) => a.kind)).toEqual(['built', 'unbuilt', 'uncolonisable']);
  });

  it('keeps a colony whose detail never loaded, flagged rather than dropped', () => {
    const [advice] = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_001, name: null, typeId: 11 }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map(),
      },
      pi
    );
    expect(advice.kind).toBe('built');
    if (advice.kind !== 'built') throw new Error('unreachable');
    expect(advice.colony.detailLoaded).toBe(false);
    expect(advice.colony.extractors).toEqual([]);
  });
});

describe('link cost', () => {
  it('reports how many links the colony has, because their cost is not in the load', () => {
    const advice = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_001, name: 'Somewhere I', typeId: 11 }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([
          [
            40_000_001,
            detail(
              [extractorPin(1, 2073)],
              [{ source_pin_id: 1, destination_pin_id: 2, link_level: 0 }]
            ),
          ],
        ]),
      },
      pi
    );

    expect(advice[0]).toMatchObject({ kind: 'built', colony: { linkCount: 1 } });
  });

  it('reports zero links for a colony that has none', () => {
    const advice = systemAdvice(
      {
        nowMs: NOW,
        planets: [{ planetId: 40_000_001, name: 'Somewhere I', typeId: 11 }],
        colonies: [colony(40_000_001, 'temperate')],
        details: new Map([[40_000_001, detail([extractorPin(1, 2073)])]]),
      },
      pi
    );

    expect(advice[0]).toMatchObject({ kind: 'built', colony: { linkCount: 0 } });
  });
});
