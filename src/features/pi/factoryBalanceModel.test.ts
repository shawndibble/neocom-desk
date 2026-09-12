import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { BuiltColonyAdvice } from './advisorModel';
import {
  colonyExportablePerHour,
  colonyFactoryBalance,
  colonyLocalDrawPerHour,
  colonyOutputPerHour,
  surplusLoad,
} from './factoryBalanceModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const BACTERIA = 2393;
const NANITES = 2463;
/** The Bacteria schematic, which is what ESI reports on a factory pin. */
const BACTERIA_SCHEMATIC = 131;
/** Nanites: 40 Bacteria + 40 Reactive Metals an hour, per Advanced pin. */
const NANITES_SCHEMATIC = 78;

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

/**
 * The reported colony, as the tab found it: four Basic pins on Bacteria and
 * eight Advanced pins on Nanites, against 6,865 Microorganisms an hour.
 *
 * Nanites also want Reactive Metals, which this planet does not extract, so
 * that line comes back `inputs-not-local` — and that is the whole point. Its
 * 320/hr appetite for the Bacteria made here is real whatever its other input
 * does.
 */
function nanitesOverBacteria() {
  return colony({
    extractors: [{ pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: 6_865, expiryMs: null }],
    extractedPerHour: [{ typeId: MICROORGANISMS, unitsPerHour: 6_865 }],
    production: [
      { schematicId: BACTERIA_SCHEMATIC, count: 4 },
      { schematicId: NANITES_SCHEMATIC, count: 8 },
    ],
  });
}

describe('colonyLocalDrawPerHour', () => {
  it('counts what a line with an imported input still draws on a local one', () => {
    const balance = colonyFactoryBalance(nanitesOverBacteria(), pi);
    // The Nanites line is `inputs-not-local` — Reactive Metals is neither
    // extracted nor made here — and it is credited for its output at all
    // eight built pins. Charging it for its Bacteria at zero is what let the
    // planner spend the same Bacteria twice.
    expect(colonyLocalDrawPerHour(balance, pi).get(BACTERIA)).toBeCloseTo(8 * 40, 6);
  });

  it('charges a measured line at the pins its inputs can actually feed', () => {
    // 6,865 Microorganisms an hour feeds 1.144 of the four Bacteria pins, so
    // the draw is that, not four pins' worth of 24,000.
    const balance = colonyFactoryBalance(nanitesOverBacteria(), pi);
    expect(colonyLocalDrawPerHour(balance, pi).get(MICROORGANISMS)).toBeCloseTo(6_865, 6);
  });
});

describe('colonyExportablePerHour', () => {
  it('offers nothing of a product this colony’s own factories already eat', () => {
    const balance = colonyFactoryBalance(nanitesOverBacteria(), pi);
    // Gross says 45.8 Bacteria an hour. The Nanite pins want 320, so there is
    // none to route anywhere — and a plan handed 45.8 of it proposed a
    // facility that could never be fed.
    expect(colonyOutputPerHour(balance, pi).get(BACTERIA)).toBeCloseTo(45.766, 2);
    expect(colonyExportablePerHour(balance, pi).has(BACTERIA)).toBe(false);
  });

  it('still offers what nothing here consumes', () => {
    const balance = colonyFactoryBalance(nanitesOverBacteria(), pi);
    // Nothing on this planet eats Nanites, so all eight pins' output stands.
    expect(colonyExportablePerHour(balance, pi).get(NANITES)).toBeCloseTo(8 * 5, 6);
  });

  it('leaves a colony with no local consumer exporting everything it makes', () => {
    const balance = colonyFactoryBalance(colony(), pi);
    expect(colonyExportablePerHour(balance, pi).get(BACTERIA)).toBeCloseTo(
      colonyOutputPerHour(balance, pi).get(BACTERIA) ?? 0,
      6
    );
  });
});
