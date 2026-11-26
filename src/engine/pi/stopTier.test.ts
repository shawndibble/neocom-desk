import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import {
  DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR,
  localChainTargets,
  recommendStopTier,
  type StopTierOptions,
} from './stopTier';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const COMPLEX_ORGANISMS = 2287;
const CARBON_COMPOUNDS = 2288;
const AUTOTROPHS = 2305;

const BACTERIA = 2393;
const WATER = 3645;
const TEST_CULTURES = 2319;
const BIOCELLS = 2329;

const TEMPERATE_P0 = [
  MICROORGANISMS,
  AQUEOUS_LIQUIDS,
  COMPLEX_ORGANISMS,
  CARBON_COMPOUNDS,
  AUTOTROPHS,
];

const LEVEL_5 = { cpu: 25_415, powergrid: 19_000 };

const PRICES: Record<number, number> = {
  [MICROORGANISMS]: 5,
  [AQUEOUS_LIQUIDS]: 5,
  [COMPLEX_ORGANISMS]: 5,
  [CARBON_COMPOUNDS]: 5,
  [AUTOTROPHS]: 5,
  [BACTERIA]: 1_000,
  [WATER]: 1_000,
  [TEST_CULTURES]: 100_000,
};

function options(overrides: Partial<StopTierOptions> = {}): StopTierOptions {
  return {
    localResources: TEMPERATE_P0,
    budget: LEVEL_5,
    infrastructure: pi.infrastructure,
    overhead: { launchpads: 1, storageFacilities: 0 },
    headsPerExtractor: 4,
    extractionRatePerHour: 6_000,
    prices: PRICES,
    taxRate: 0.1,
    salesTaxPct: 0,
    linkCapacityPerHour: null,
    bufferHours: 24,
    extraExtractorYieldFactor: 1,
    ...overrides,
  };
}

describe('localChainTargets', () => {
  it('offers a product whose whole P0 demand the planet can extract itself', () => {
    expect(localChainTargets(TEMPERATE_P0, pi)).toContain(TEST_CULTURES);
    expect(localChainTargets(TEMPERATE_P0, pi)).toContain(BACTERIA);
  });

  it('drops a product needing a P0 this planet does not yield', () => {
    expect(localChainTargets(TEMPERATE_P0, pi)).not.toContain(BIOCELLS);
  });

  it('offers nothing when the planet yields nothing', () => {
    expect(localChainTargets([], pi)).toEqual([]);
  });
});

describe('recommendStopTier', () => {
  it('scores a made tier at the fitted colony’s own output, in ISK an hour', () => {
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;

    const cultures = advice.entries.find((entry) => entry.typeId === TEST_CULTURES);
    expect(cultures?.status).toBe('scored');
    if (cultures?.status !== 'scored') return;

    expect(cultures.blocks).toBe(1);
    expect(cultures.limitedBy).toEqual(['powergrid']);
    expect(cultures.unitsPerHour).toBe(5);
    expect(cultures.used).toEqual({ cpu: 3_600 + 2_580, powergrid: 700 + 11_900 });

    expect(cultures.marginPerUnit).toBeCloseTo(86_680, 6);
    expect(cultures.marginPerHour).toBeCloseTo(433_400, 6);
  });

  it('scores the whole colony, not one factory of it', () => {
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;

    const bacteria = advice.entries.find((entry) => entry.typeId === BACTERIA);
    expect(bacteria?.status).toBe('scored');
    if (bacteria?.status !== 'scored') return;

    expect(bacteria.blocks).toBe(3);
    expect(bacteria.unitsPerHour).toBe(120);
    expect(bacteria.marginPerUnit).toBeCloseTo(172.5, 6);
    expect(bacteria.marginPerHour).toBeCloseTo(20_700, 6);
  });

  it('scores selling the raw resource as its own candidate, so P0 can win', () => {
    const advice = recommendStopTier(options({ prices: { ...PRICES, [MICROORGANISMS]: 500 } }), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    expect(advice.best.typeId).toBe(MICROORGANISMS);
    expect(advice.best.tier).toBe(0);

    expect(advice.best.blocks).toBe(3);
    expect(advice.best.unitsPerHour).toBe(18_000);
    expect(advice.best.marginPerUnit).toBeCloseTo(499.5, 6);
    expect(advice.best.marginPerHour).toBeCloseTo(8_991_000, 6);
  });

  it('nets sales tax off the raw resource candidate before customs', () => {
    const advice = recommendStopTier(
      options({ prices: { ...PRICES, [MICROORGANISMS]: 500 }, salesTaxPct: 7.5 }),
      pi
    );
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    expect(advice.best.typeId).toBe(MICROORGANISMS);
    expect(advice.best.marginPerUnit).toBeCloseTo(462, 6);
  });

  it('nets sales tax off a made-tier candidate’s revenue via chainCost', () => {
    const untaxed = recommendStopTier(options(), pi);
    const taxed = recommendStopTier(options({ salesTaxPct: 7.5 }), pi);
    expect(untaxed.kind).toBe('recommended');
    expect(taxed.kind).toBe('recommended');
    if (untaxed.kind !== 'recommended' || taxed.kind !== 'recommended') return;
    const before = untaxed.entries.find((entry) => entry.typeId === TEST_CULTURES);
    const after = taxed.entries.find((entry) => entry.typeId === TEST_CULTURES);
    if (before?.status !== 'scored' || after?.status !== 'scored')
      throw new Error('expected scored');
    expect(after.marginPerUnit).toBeCloseTo(before.marginPerUnit - 7_500, 6);
  });

  it('recommends the highest margin an hour, not the highest tier', () => {
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    expect(advice.best.typeId).toBe(TEST_CULTURES);
    expect(advice.best.marginPerHour).toBeCloseTo(433_400, 6);
    const margins = advice.entries
      .filter((entry) => entry.status === 'scored')
      .map((entry) => entry.marginPerHour);
    expect(Math.max(...margins)).toBeCloseTo(advice.best.marginPerHour, 6);
  });

  it('reports the pins a scored layout would actually be built from', () => {
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;

    const { pins } = advice.best;
    expect(pins.launchpad).toBeGreaterThan(0);
    expect(pins.extractorControlUnit).toBeGreaterThan(0);
    expect(pins.basic).toBeGreaterThan(0);
    expect(pins.advanced).toBeGreaterThan(0);
  });

  it('refuses a candidate the hub does not quote rather than dropping the whole run', () => {
    const withoutCultures = { ...PRICES };
    delete withoutCultures[TEST_CULTURES];
    const advice = recommendStopTier(options({ prices: withoutCultures }), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;

    const cultures = advice.entries.find((entry) => entry.typeId === TEST_CULTURES);
    expect(cultures?.status).toBe('needs-price');
    if (cultures?.status !== 'needs-price') return;
    expect(cultures.missing).toEqual([TEST_CULTURES]);
    expect(advice.entries.some((entry) => entry.status === 'scored')).toBe(true);
  });

  it('rejects a candidate whose flow overruns its own buffer', () => {
    const advice = recommendStopTier(options({ bufferHours: 24 * 7 }), pi);
    const cultures =
      advice.kind === 'recommended' || advice.kind === 'no-recommendation'
        ? advice.entries.find((entry) => entry.typeId === TEST_CULTURES)
        : undefined;
    expect(cultures?.status).toBe('rejected-throughput');
    if (cultures?.status !== 'rejected-throughput') return;
    expect(cultures.throughput.verdict).toBe('buffer-overflow');
  });

  it('does not reject a candidate merely because link capacity is unknown', () => {
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    expect(advice.best.throughput.verdict).toBe('link-capacity-unknown');
  });

  it('reports a candidate that does not fit rather than scoring it at zero', () => {
    const advice = recommendStopTier(options({ budget: { cpu: 1_675, powergrid: 6_000 } }), pi);
    const entries = advice.kind === 'nothing-to-score' ? [] : advice.entries;
    const cultures = entries.find((entry) => entry.typeId === TEST_CULTURES);
    expect(cultures?.status).toBe('does-not-fit');
  });

  it('has nothing to score on a planet that yields nothing', () => {
    const advice = recommendStopTier(options({ localResources: [] }), pi);
    expect(advice.kind).toBe('nothing-to-score');
  });

  describe('names what stopped every candidate, rather than leaving a caller to guess', () => {
    function everythingAt(price: number): Record<number, number> {
      return Object.fromEntries(
        [...TEMPERATE_P0, ...localChainTargets(TEMPERATE_P0, pi)].map((typeId) => [typeId, price])
      );
    }

    function blockerFrom(overrides: Partial<StopTierOptions>) {
      const advice = recommendStopTier(options(overrides), pi);
      expect(advice.kind).toBe('no-recommendation');
      return advice.kind === 'no-recommendation' ? advice.blocker : null;
    }

    it('blames the hub when everything that fits is unquoted', () => {
      expect(blockerFrom({ prices: {} })).toBe('needs-prices');
    });

    it('blames the Command Center when nothing fits at all', () => {
      expect(blockerFrom({ budget: { cpu: 1_675, powergrid: 6_000 } })).toBe('does-not-fit');
    });

    it('blames the buffer when everything that fits would overflow it', () => {
      expect(blockerFrom({ bufferHours: 24 * 365, prices: everythingAt(1_000) })).toBe(
        'throughput'
      );
    });

    it('blames the prices when everything fits, is quoted, and still loses money', () => {
      expect(blockerFrom({ prices: everythingAt(0.01) })).toBe('unprofitable');
    });

    it('refuses to name one cause when the candidates disagree', () => {
      expect(blockerFrom({ prices: { [MICROORGANISMS]: 0.01 } })).toBe('mixed');
    });
  });

  it('breaks a tie toward the lower tier, so the simpler colony wins', () => {
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    const cultures = advice.entries.find((entry) => entry.typeId === TEST_CULTURES);
    if (cultures?.status !== 'scored') return;

    const bacteria = advice.entries.find((entry) => entry.typeId === BACTERIA);
    if (bacteria?.status !== 'scored') return;
    const tied = recommendStopTier(
      options({
        prices: {
          ...PRICES,
          [BACTERIA]:
            PRICES[BACTERIA] +
            (cultures.marginPerHour - bacteria.marginPerHour) / bacteria.unitsPerHour,
        },
      }),
      pi
    );
    expect(tied.kind).toBe('recommended');
    if (tied.kind !== 'recommended') return;
    expect(tied.best.typeId).toBe(BACTERIA);
    expect(tied.best.tier).toBe(1);
  });

  it('ties only against the top margin, not along a chain of near-neighbours', () => {
    const step = 12 / 18_000;
    const advice = recommendStopTier(
      options({
        prices: {
          [MICROORGANISMS]: 1_000,
          [AQUEOUS_LIQUIDS]: 1_000 + step,
          [COMPLEX_ORGANISMS]: 1_000 + 2 * step,
          [CARBON_COMPOUNDS]: 1,
          [AUTOTROPHS]: 1,
        },
      }),
      pi
    );
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    expect(advice.best.typeId).toBe(AQUEOUS_LIQUIDS);
    expect(advice.best.marginPerHour).toBeGreaterThan(18_000 * (999.5 + step) - 1);
  });

  describe('extra extractors do not yield the measured mean rate (issue #957)', () => {
    it('leaves a one-extractor fit unchanged, whatever the factor', () => {
      const advice = recommendStopTier(options({ extraExtractorYieldFactor: 0.3 }), pi);
      expect(advice.kind).toBe('recommended');
      if (advice.kind !== 'recommended') return;
      const cultures = advice.entries.find((entry) => entry.typeId === TEST_CULTURES);
      expect(cultures?.status).toBe('scored');
      if (cultures?.status !== 'scored') return;
      expect(cultures.blocks).toBe(1);
      expect(cultures.unitsPerHour).toBe(5);
      expect(cultures.marginPerHour).toBeCloseTo(433_400, 6);
    });

    it('reduces a raw candidate’s output once more than one extractor fits', () => {
      const priced = { ...PRICES, [MICROORGANISMS]: 500 };
      const advice = recommendStopTier(
        options({ prices: priced, extraExtractorYieldFactor: 0.5 }),
        pi
      );
      expect(advice.kind).toBe('recommended');
      if (advice.kind !== 'recommended') return;
      expect(advice.best.typeId).toBe(MICROORGANISMS);
      expect(advice.best.blocks).toBe(3);
      expect(advice.best.unitsPerHour).toBeCloseTo(12_000, 6);
      expect(advice.best.marginPerUnit).toBeCloseTo(499.5, 6);
      expect(advice.best.marginPerHour).toBeCloseTo(12_000 * 499.5, 6);
    });

    it('reduces a made-tier candidate at the same extractor count by the same factor', () => {
      const baseline = recommendStopTier(options({ extraExtractorYieldFactor: 1 }), pi);
      const fallenOff = recommendStopTier(options({ extraExtractorYieldFactor: 0.5 }), pi);
      expect(baseline.kind).toBe('recommended');
      expect(fallenOff.kind).toBe('recommended');
      if (baseline.kind !== 'recommended' || fallenOff.kind !== 'recommended') return;

      const bacteriaBefore = baseline.entries.find((entry) => entry.typeId === BACTERIA);
      const bacteriaAfter = fallenOff.entries.find((entry) => entry.typeId === BACTERIA);
      expect(bacteriaBefore?.status).toBe('scored');
      expect(bacteriaAfter?.status).toBe('scored');
      if (bacteriaBefore?.status !== 'scored' || bacteriaAfter?.status !== 'scored') return;
      expect(bacteriaBefore.blocks).toBe(3);
      expect(bacteriaAfter.blocks).toBe(3);
      expect(bacteriaBefore.unitsPerHour).toBe(120);
      expect(bacteriaAfter.unitsPerHour).toBeCloseTo(80, 6);
      expect(bacteriaAfter.marginPerUnit).toBeCloseTo(bacteriaBefore.marginPerUnit, 6);

      const madeRatio = bacteriaAfter.unitsPerHour / bacteriaBefore.unitsPerHour;

      const rawBaseline = recommendStopTier(
        options({ prices: { ...PRICES, [MICROORGANISMS]: 500 }, extraExtractorYieldFactor: 1 }),
        pi
      );
      const rawFallenOff = recommendStopTier(
        options({ prices: { ...PRICES, [MICROORGANISMS]: 500 }, extraExtractorYieldFactor: 0.5 }),
        pi
      );
      expect(rawBaseline.kind).toBe('recommended');
      expect(rawFallenOff.kind).toBe('recommended');
      if (rawBaseline.kind !== 'recommended' || rawFallenOff.kind !== 'recommended') return;
      const rawRatio = rawFallenOff.best.unitsPerHour / rawBaseline.best.unitsPerHour;

      expect(madeRatio).toBeCloseTo(rawRatio, 10);
    });

    it('applies the documented conservative default when the caller passes none', () => {
      const opts = options({ prices: { ...PRICES, [MICROORGANISMS]: 500 } });
      delete opts.extraExtractorYieldFactor;
      const advice = recommendStopTier(opts, pi);
      expect(advice.kind).toBe('recommended');
      if (advice.kind !== 'recommended') return;
      expect(advice.best.typeId).toBe(MICROORGANISMS);
      expect(advice.best.blocks).toBe(3);
      expect(advice.best.unitsPerHour).toBeCloseTo(
        6_000 * (1 + (3 - 1) * DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR),
        6
      );
      expect(DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR).toBeLessThan(1);
    });

    it('keys a made-tier candidate’s falloff on its true extractor count, not on blocks', () => {
      const rate = 3_000;
      const baseline = recommendStopTier(
        options({ extractionRatePerHour: rate, extraExtractorYieldFactor: 1 }),
        pi
      );
      const fallenOff = recommendStopTier(
        options({ extractionRatePerHour: rate, extraExtractorYieldFactor: 0.5 }),
        pi
      );
      expect(baseline.kind).toBe('recommended');
      expect(fallenOff.kind).toBe('recommended');
      if (baseline.kind !== 'recommended' || fallenOff.kind !== 'recommended') return;

      const before = baseline.entries.find((entry) => entry.typeId === BACTERIA);
      const after = fallenOff.entries.find((entry) => entry.typeId === BACTERIA);
      expect(before?.status).toBe('scored');
      expect(after?.status).toBe('scored');
      if (before?.status !== 'scored' || after?.status !== 'scored') return;

      expect(before.pins.extractorControlUnit).toBe(2 * before.blocks);

      const trueExtractorCount = before.pins.extractorControlUnit ?? 0;
      const expectedRatio = (1 + (trueExtractorCount - 1) * 0.5) / trueExtractorCount;
      expect(after.unitsPerHour / before.unitsPerHour).toBeCloseTo(expectedRatio, 10);

      const wrongRatioKeyedOnBlocks = (1 + (before.blocks - 1) * 0.5) / before.blocks;
      expect(expectedRatio).toBeLessThan(wrongRatioKeyedOnBlocks);
    });
  });
});
