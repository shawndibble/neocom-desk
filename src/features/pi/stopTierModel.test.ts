import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { BuiltColonyAdvice } from './advisorModel';
import {
  colonyStopTierAdvice,
  meanExtractorRate,
  meanHeadsPerExtractor,
  type ColonyStopTierInput,
} from './stopTierModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BACTERIA = 2393;
const TEST_CULTURES = 2319;

const PRICES: Record<number, number> = {
  [MICROORGANISMS]: 5,
  [AQUEOUS_LIQUIDS]: 5,
  2287: 5,
  2288: 5,
  2305: 5,
  [BACTERIA]: 1_000,
  3645: 1_000,
  [TEST_CULTURES]: 100_000,
};

function colony(overrides: Partial<BuiltColonyAdvice> = {}): BuiltColonyAdvice {
  return {
    upgradeLevel: 5,
    budget: { cpu: 25_415, powergrid: 19_000 },
    lastUpdate: '2026-09-01T00:00:00Z',
    detailLoaded: true,
    pinLoad: {
      counts: { extractorControlUnit: 2, launchpad: 1 },
      extractorHeads: 8,
      load: { cpu: 5_320, powergrid: 12_600 },
      linkLoad: { cpu: 415, powergrid: 300 },
      newLinkLoad: { cpu: 180, powergrid: 130 },
      linkCount: 3,
      unknownTypeIds: [],
    },
    extractors: [
      { pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: 6_000, expiryMs: null },
      { pinId: 2, productTypeId: AQUEOUS_LIQUIDS, ratePerHour: 6_000, expiryMs: null },
    ],
    extractedPerHour: [
      { typeId: MICROORGANISMS, unitsPerHour: 6_000 },
      { typeId: AQUEOUS_LIQUIDS, unitsPerHour: 6_000 },
    ],
    production: [],
    linkCount: 3,
    hasUnverifiedExtractors: false,
    ...overrides,
  };
}

function input(overrides: Partial<ColonyStopTierInput> = {}): ColonyStopTierInput {
  return {
    colony: colony(),
    planetType: 'temperate',
    pi,
    prices: PRICES,
    taxRate: 0.1,
    ...overrides,
  };
}

describe('meanExtractorRate', () => {
  it('averages per extractor, not per resource', () => {
    // Two extractors on one resource is 6,000 an hour each, not 12,000.
    const advice = colony({
      extractors: [
        { pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: 6_000, expiryMs: null },
        { pinId: 2, productTypeId: MICROORGANISMS, ratePerHour: 6_000, expiryMs: null },
      ],
      extractedPerHour: [{ typeId: MICROORGANISMS, unitsPerHour: 12_000 }],
    });
    expect(meanExtractorRate(advice)).toBe(6_000);
  });

  it('drops an extractor that could not be projected rather than averaging in a zero', () => {
    const advice = colony({
      extractors: [
        { pinId: 1, productTypeId: MICROORGANISMS, ratePerHour: 6_000, expiryMs: null },
        { pinId: 2, productTypeId: AQUEOUS_LIQUIDS, ratePerHour: null, expiryMs: null },
      ],
    });
    expect(meanExtractorRate(advice)).toBe(6_000);
  });

  it('has no rate at all when nothing could be projected', () => {
    expect(meanExtractorRate(colony({ extractors: [] }))).toBeNull();
  });
});

describe('meanHeadsPerExtractor', () => {
  it('reads the colony’s own heads per ECU', () => {
    expect(meanHeadsPerExtractor(colony())).toBe(4);
  });

  it('stays inside the range fitColony accepts', () => {
    const many = colony({
      pinLoad: { ...colony().pinLoad, counts: { extractorControlUnit: 1 }, extractorHeads: 40 },
    });
    expect(meanHeadsPerExtractor(many)).toBe(10);
    const none = colony({
      pinLoad: { ...colony().pinLoad, counts: { extractorControlUnit: 1 }, extractorHeads: 0 },
    });
    expect(meanHeadsPerExtractor(none)).toBe(1);
  });
});

describe('colonyStopTierAdvice', () => {
  it('recommends a tier off the colony’s own measurements', () => {
    const result = colonyStopTierAdvice(input());
    expect(result.status).toBe('advised');
    if (result.status !== 'advised') return;
    expect(result.advice.kind).toBe('recommended');
    if (result.advice.kind !== 'recommended') return;
    expect(result.advice.best.typeId).toBe(TEST_CULTURES);
  });

  it('says when the colony is already running what was recommended', () => {
    // Test Cultures is schematic 86. A colony already making it is not being
    // told to "build up to" it.
    const result = colonyStopTierAdvice(
      input({ colony: colony({ production: [{ schematicId: 86, count: 1 }] }) })
    );
    expect(result.status).toBe('advised');
    if (result.status !== 'advised') return;
    expect(result.advice.kind === 'recommended' && result.advice.best.typeId).toBe(TEST_CULTURES);
    expect(result.alreadyRunning).toBe(true);
  });

  it('does not call a colony making something else already there', () => {
    // Schematic 133 is Reactive Metals — not what this planet was advised to
    // build, so the recommendation is still a change to make.
    const result = colonyStopTierAdvice(
      input({ colony: colony({ production: [{ schematicId: 133, count: 1 }] }) })
    );
    expect(result.status).toBe('advised');
    if (result.status !== 'advised') return;
    expect(result.alreadyRunning).toBe(false);
  });

  it('counts a raw recommendation as already there only when nothing is refined', () => {
    // At 500 ISK the ore beats every made tier, and a colony with no factory
    // is already doing exactly that.
    const rawWins = { ...PRICES, [MICROORGANISMS]: 500 };
    const bare = colonyStopTierAdvice(input({ prices: rawWins }));
    expect(bare.status === 'advised' && bare.alreadyRunning).toBe(true);

    const refining = colonyStopTierAdvice(
      input({ prices: rawWins, colony: colony({ production: [{ schematicId: 86, count: 1 }] }) })
    );
    expect(refining.status === 'advised' && refining.alreadyRunning).toBe(false);
  });

  it('fits against the budget the links leave, not the Command Center’s full supply', () => {
    // The same colony with a heavier link draw has less Powergrid to fit into,
    // so its recommendation is measurably smaller.
    const heavy = colonyStopTierAdvice(
      input({
        colony: colony({
          pinLoad: { ...colony().pinLoad, linkLoad: { cpu: 415, powergrid: 7_000 } },
        }),
      })
    );
    expect(heavy.status).toBe('advised');
    if (heavy.status !== 'advised') return;
    if (heavy.advice.kind !== 'recommended') throw new Error('expected a recommendation');

    const light = colonyStopTierAdvice(input());
    if (light.status !== 'advised' || light.advice.kind !== 'recommended') {
      throw new Error('expected a recommendation');
    }
    const heavyBacteria = heavy.advice.entries.find((entry) => entry.typeId === BACTERIA);
    const lightBacteria = light.advice.entries.find((entry) => entry.typeId === BACTERIA);
    if (heavyBacteria?.status !== 'scored' || lightBacteria?.status !== 'scored') {
      throw new Error('expected both to be scored');
    }
    expect(heavyBacteria.blocks).toBeLessThan(lightBacteria.blocks);
  });

  it('refuses when the colony has links it cannot cost', () => {
    const result = colonyStopTierAdvice(
      input({ colony: colony({ pinLoad: { ...colony().pinLoad, linkLoad: null } }) })
    );
    expect(result).toEqual({ status: 'needs-link-cost', linkCount: 3 });
  });

  it('costs a colony with no links at all rather than refusing it', () => {
    const result = colonyStopTierAdvice(
      input({
        colony: colony({
          linkCount: 0,
          pinLoad: { ...colony().pinLoad, linkLoad: null, linkCount: 0 },
        }),
      })
    );
    expect(result.status).toBe('advised');
  });

  it('refuses when no extractor here could be projected', () => {
    const result = colonyStopTierAdvice(input({ colony: colony({ extractors: [] }) }));
    expect(result).toEqual({ status: 'needs-measured-extraction' });
  });

  it('offers nothing the planet type cannot yield', () => {
    const result = colonyStopTierAdvice(input({ planetType: 'lava' }));
    expect(result.status).toBe('advised');
    if (result.status !== 'advised') return;
    const entries = result.advice.kind === 'nothing-to-score' ? [] : result.advice.entries;
    // Test Cultures needs Microorganisms and Aqueous Liquids; a Lava planet
    // yields neither.
    expect(entries.some((entry) => entry.typeId === TEST_CULTURES)).toBe(false);
  });
});
