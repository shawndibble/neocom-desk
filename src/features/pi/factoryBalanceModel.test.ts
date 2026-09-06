import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { BuiltColonyAdvice } from './advisorModel';
import { colonyFactoryBalance, surplusLoad } from './factoryBalanceModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const BACTERIA = 2393;
/** The Bacteria schematic, which is what ESI reports on a factory pin. */
const BACTERIA_SCHEMATIC = 131;

function colony(overrides: Partial<BuiltColonyAdvice> = {}): BuiltColonyAdvice {
  return {
    upgradeLevel: 4,
    budget: { cpu: 21_315, powergrid: 17_000 },
    lastUpdate: '2026-09-06T00:00:00Z',
    detailLoaded: true,
    pinLoad: {
      counts: { extractorControlUnit: 1, basic: 8, storage: 1, launchpad: 1 },
      extractorHeads: 10,
      load: { cpu: 7_560, powergrid: 16_155 },
      linkLoad: { cpu: 360, powergrid: 255 },
      newLinkLoad: { cpu: 30, powergrid: 21 },
      linkCount: 12,
      unknownTypeIds: [],
    },
    extractors: [{ pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: 21_201, expiryMs: null }],
    extractedPerHour: [{ typeId: MICROORGANISMS, unitsPerHour: 21_201 }],
    production: [{ schematicId: BACTERIA_SCHEMATIC, count: 8 }],
    linkCount: 12,
    hasUnverifiedExtractors: false,
    ...overrides,
  };
}

describe('colonyFactoryBalance', () => {
  it('turns ESI’s schematic ids into the products the engine is keyed by', () => {
    // The reported colony, whole: eight Basic Industry Facilities on Bacteria
    // against 21,201 Microorganisms an hour.
    const [line] = colonyFactoryBalance(colony(), pi);
    expect(line.typeId).toBe(BACTERIA);
    expect(line.name).toBe('Bacteria');
    expect(line.facility).toBe('basic');
    if (line.status !== 'measured') throw new Error('unreachable');
    expect(line.pins).toBe(8);
    expect(line.fedPins).toBe(4);
    expect(line.surplusPins).toBe(4);
  });

  it('drops a factory pin whose schematic never resolved rather than miscounting one', () => {
    // `groupFactoryPins` keys an unresolvable pin under `undefined`. Folding
    // those into a real schematic's count would inflate its demand and invent
    // a surplus out of a lookup failure.
    const balance = colonyFactoryBalance(
      colony({
        production: [
          { schematicId: BACTERIA_SCHEMATIC, count: 4 },
          { schematicId: undefined, count: 4 },
        ],
      }),
      pi
    );
    expect(balance).toHaveLength(1);
    if (balance[0].status !== 'measured') throw new Error('unreachable');
    expect(balance[0].pins).toBe(4);
    expect(balance[0].surplusPins).toBe(0);
  });

  it('has nothing to say about a colony with no factories', () => {
    expect(colonyFactoryBalance(colony({ production: [] }), pi)).toEqual([]);
  });

  it('says an extractor with no measured rate leaves its factories unmeasurable', () => {
    // Not zero — `advisorModel` leaves an unprojectable program out of
    // `extractedPerHour` entirely, and calling that a starved colony would
    // advise deleting eight working factories.
    const [line] = colonyFactoryBalance(colony({ extractedPerHour: [] }), pi);
    expect(line.status).toBe('inputs-not-local');
  });
});

describe('surplusLoad', () => {
  it('prices what the unfed pins are holding', () => {
    const balance = colonyFactoryBalance(colony(), pi);
    // Four Basic Industry Facilities at 200 tf / 800 MW each — the powergrid
    // that is the stated reason nothing else fits on this colony.
    expect(surplusLoad(balance, pi)).toEqual({ cpu: 800, powergrid: 3_200 });
  });

  it('is nothing on a colony in balance', () => {
    const balance = colonyFactoryBalance(
      colony({ production: [{ schematicId: BACTERIA_SCHEMATIC, count: 4 }] }),
      pi
    );
    expect(surplusLoad(balance, pi)).toEqual({ cpu: 0, powergrid: 0 });
  });

  it('counts nothing for a line whose inputs are imported', () => {
    const balance = colonyFactoryBalance(colony({ extractedPerHour: [] }), pi);
    expect(surplusLoad(balance, pi)).toEqual({ cpu: 0, powergrid: 0 });
  });
});
