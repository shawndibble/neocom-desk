import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import {
  builtColonyEarnings,
  saleableOutputPerHour,
  totalColonyEarnings,
} from './colonyEarningsModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BACTERIA = 2393;
const TEST_CULTURES = 2319;
const NANITES = 2463;

const BACTERIA_SCHEMATIC = 131;
const WATER_SCHEMATIC = 121;
const TEST_CULTURES_SCHEMATIC = 86;
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
    stoppedExtraction: null,
    production: [{ schematicId: BACTERIA_SCHEMATIC, count: 8 }],
    linkCount: 12,
    hasUnverifiedExtractors: false,
    ...overrides,
  };
}

describe('saleableOutputPerHour', () => {
  it('credits an extraction-only colony on what it digs up, with nothing to net against', () => {
    const out = saleableOutputPerHour(
      colony({
        production: [],
        extractedPerHour: [{ typeId: MICROORGANISMS, unitsPerHour: 21_201 }],
      }),
      pi
    );
    expect(out).toEqual(new Map([[MICROORGANISMS, 21_201]]));
  });

  it('credits a made tier at its fed rate, not its built one', () => {
    const out = saleableOutputPerHour(colony(), pi);
    expect(out.size).toBe(1);
    expect(out.get(BACTERIA)).toBeCloseTo((21_201 / 6_000) * 40, 5);
  });

  it('nets a two-hop local chain down to just the top tier', () => {
    const out = saleableOutputPerHour(
      colony({
        extractors: [
          { pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: 6_000, expiryMs: null },
          { pinId: 2, productTypeId: AQUEOUS_LIQUIDS, ratePerHour: 6_000, expiryMs: null },
        ],
        extractedPerHour: [
          { typeId: MICROORGANISMS, unitsPerHour: 6_000 },
          { typeId: AQUEOUS_LIQUIDS, unitsPerHour: 6_000 },
        ],
        production: [
          { schematicId: BACTERIA_SCHEMATIC, count: 1 },
          { schematicId: WATER_SCHEMATIC, count: 1 },
          { schematicId: TEST_CULTURES_SCHEMATIC, count: 1 },
        ],
      }),
      pi
    );
    expect(out).toEqual(new Map([[TEST_CULTURES, 5]]));
  });

  it('reports nothing for a colony whose own extraction exists but could not be projected', () => {
    const out = saleableOutputPerHour(
      colony({
        extractors: [
          { pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: null, expiryMs: null },
        ],
        extractedPerHour: [],
      }),
      pi
    );
    expect(out).toEqual(new Map());
  });

  it('credits a genuinely import-fed colony at its built pin count', () => {
    const out = saleableOutputPerHour(
      colony({
        extractors: [],
        extractedPerHour: [],
        production: [{ schematicId: TEST_CULTURES_SCHEMATIC, count: 2 }],
      }),
      pi
    );
    expect(out).toEqual(new Map([[TEST_CULTURES, 10]]));
  });

  it('has nothing to report for a colony with no extraction and no production', () => {
    const out = saleableOutputPerHour(
      colony({ extractors: [], extractedPerHour: [], production: [] }),
      pi
    );
    expect(out).toEqual(new Map());
  });
});

describe('builtColonyEarnings', () => {
  it('prices the fed rate, not the built one', () => {
    const result = builtColonyEarnings(colony(), pi, {
      prices: { [BACTERIA]: 1_000 },
      taxRate: 0.1,
      salesTaxPct: 0,
    });
    expect(result.iskPerHour).toBeCloseTo((21_201 / 6_000) * 40 * 960, 2);
    expect(result.unpriced).toEqual([]);
  });

  it('returns null for a colony whose own extraction could not be projected', () => {
    const result = builtColonyEarnings(
      colony({
        extractors: [
          { pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: null, expiryMs: null },
        ],
        extractedPerHour: [],
      }),
      pi,
      { prices: { [BACTERIA]: 1_000 }, taxRate: 0.1, salesTaxPct: 0 }
    );
    expect(result.iskPerHour).toBeNull();
  });
});

describe('totalColonyEarnings', () => {
  it('sums the colonies that have a figure and counts the ones that do not', () => {
    const total = totalColonyEarnings([
      { iskPerHour: 100, unpriced: [BACTERIA] },
      { iskPerHour: null, unpriced: [TEST_CULTURES] },
      { iskPerHour: 200, unpriced: [] },
    ]);
    expect(total.iskPerHour).toBe(300);
    expect(total.unpriced.sort()).toEqual([BACTERIA, TEST_CULTURES].sort());
    expect(total.coloniesWithoutFigure).toBe(1);
  });

  it('is null, not zero, when not one colony has a figure', () => {
    const total = totalColonyEarnings([
      { iskPerHour: null, unpriced: [] },
      { iskPerHour: null, unpriced: [] },
    ]);
    expect(total.iskPerHour).toBeNull();
    expect(total.coloniesWithoutFigure).toBe(2);
  });

  it('is null, not zero, for no colonies at all', () => {
    expect(totalColonyEarnings([])).toEqual({
      iskPerHour: null,
      unpriced: [],
      coloniesWithoutFigure: 0,
    });
  });
});

describe('saleableOutputPerHour, against a line with one imported input', () => {
  it('does not sell the Bacteria its own Nanite pins are eating', () => {
    const saleable = saleableOutputPerHour(
      colony({
        extractors: [
          { pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: 6_865, expiryMs: null },
        ],
        extractedPerHour: [{ typeId: MICROORGANISMS, unitsPerHour: 6_865 }],
        production: [
          { schematicId: BACTERIA_SCHEMATIC, count: 4 },
          { schematicId: NANITES_SCHEMATIC, count: 8 },
        ],
      }),
      pi
    );
    expect(saleable.has(BACTERIA)).toBe(false);
    expect(saleable.get(NANITES)).toBeCloseTo(8 * 5, 6);
  });
});
