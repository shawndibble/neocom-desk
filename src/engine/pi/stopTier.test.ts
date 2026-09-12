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

// The real snapshot, same reasoning as pinBudget.test.ts: the pin counts and
// margins below are claims about the shipped recipe graph and the shipped
// CPU/Powergrid table, so a hand-made stub would pin nothing.
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/** Microorganisms and Aqueous Liquids — the two P0 a Temperate planet needs for Test Cultures. */
const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const COMPLEX_ORGANISMS = 2287;
const CARBON_COMPOUNDS = 2288;
const AUTOTROPHS = 2305;

const BACTERIA = 2393;
const WATER = 3645;
/** Test Cultures — a P2 whose two P1 inputs each come off one Temperate planet's own P0. */
const TEST_CULTURES = 2319;
/** Biocells — a P2 needing Precious Metals, which a Temperate planet does not yield. */
const BIOCELLS = 2329;

const TEMPERATE_P0 = [
  MICROORGANISMS,
  AQUEOUS_LIQUIDS,
  COMPLEX_ORGANISMS,
  CARBON_COMPOUNDS,
  AUTOTROPHS,
];

/** Command Center upgrade level 5, the shipped table's top row. */
const LEVEL_5 = { cpu: 25_415, powergrid: 19_000 };

/**
 * Round figures, so every margin asserted below can be derived by hand. A P0
 * at 5 ISK and a P2 at 100,000 makes the made tier win by a wide, checkable
 * margin.
 */
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
    linkCapacityPerHour: null,
    bufferHours: 24,
    // 1 = no falloff. Every test above this option's own describe block is
    // about something else (block scaling, tax, tie-breaking, blockers) and
    // was written and hand-checked against the un-fallen-off numbers, so it
    // stays pinned to "off" here rather than picking up whatever the engine's
    // own default happens to be.
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
    // Biocells takes Precious Metals, which no Temperate extractor reaches.
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

    // One ratio block is 1 Advanced + 2 Basic + 2 ECU (one per P0 type at
    // 6,000/hr), each ECU carrying four heads:
    //   cpu 500 + 2*200 + 2*400 + 8*110 = 2,580 tf
    //   pg  700 + 2*800 + 2*2,600 + 8*550 = 11,900 MW
    // Level 5 supplies 25,415 tf / 19,000 MW, less a Launchpad's 3,600 / 700,
    // so Powergrid binds at 18,300 / 11,900 = one block.
    expect(cultures.blocks).toBe(1);
    expect(cultures.limitedBy).toEqual(['powergrid']);
    // One block is one P2 factory: 5 Test Cultures an hour.
    expect(cultures.unitsPerHour).toBe(5);

    // Per Test Cultures unit: 1,200 of each P0 (8 P1 units at 150 P0 each),
    //   sourced 2,400 * 5             = 12,000 ISK
    //   import tax base 2,400 * 5 * 0.5 = 6,000
    //   export tax base 1 * 7,200       = 7,200
    //   tax 0.1 * 13,200                = 1,320 ISK
    //   margin 100,000 - 12,000 - 1,320 = 86,680 ISK
    expect(cultures.marginPerUnit).toBeCloseTo(86_680, 6);
    expect(cultures.marginPerHour).toBeCloseTo(433_400, 6);
  });

  it('scores the whole colony, not one factory of it', () => {
    // Test Cultures above fits exactly one block, which hides the block
    // multiplier entirely — drop it and that assertion still passes. Bacteria
    // fits three, so this is the case that pins it.
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;

    const bacteria = advice.entries.find((entry) => entry.typeId === BACTERIA);
    expect(bacteria?.status).toBe('scored');
    if (bacteria?.status !== 'scored') return;

    // One block is 1 Basic + 1 ECU on four heads: 200 + 400 + 4*110 = 1,040 tf
    // and 800 + 2,600 + 4*550 = 5,600 MW. Powergrid binds at 18,300 / 5,600.
    expect(bacteria.blocks).toBe(3);
    // Three P1 factories at 40 an hour each.
    expect(bacteria.unitsPerHour).toBe(120);
    // Per Bacteria unit: 150 Microorganisms at 5 ISK = 750 sourced, tax
    // 0.1 * (150 * 5 * 0.5 + 400) = 77.5, so 1,000 - 827.5 = 172.5.
    expect(bacteria.marginPerUnit).toBeCloseTo(172.5, 6);
    expect(bacteria.marginPerHour).toBeCloseTo(20_700, 6);
  });

  it('scores selling the raw resource as its own candidate, so P0 can win', () => {
    // At 5 ISK a unit the raw floor loses; at 500 it beats the P2 outright,
    // which is the answer a 10% customs rate is supposed to be able to give.
    const advice = recommendStopTier(options({ prices: { ...PRICES, [MICROORGANISMS]: 500 } }), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    expect(advice.best.typeId).toBe(MICROORGANISMS);
    expect(advice.best.tier).toBe(0);

    // A block is one ECU with four heads: 400 + 4*110 = 840 tf,
    // 2,600 + 4*550 = 4,800 MW. Level 5 less a Launchpad leaves 21,815 tf /
    // 18,300 MW, so Powergrid binds at three extractors.
    expect(advice.best.blocks).toBe(3);
    expect(advice.best.unitsPerHour).toBe(18_000);
    // 500 ISK less the export tax on a taxable value of 5: 0.1 * 5 = 0.5.
    expect(advice.best.marginPerUnit).toBeCloseTo(499.5, 6);
    expect(advice.best.marginPerHour).toBeCloseTo(8_991_000, 6);
  });

  it('recommends the highest margin an hour, not the highest tier', () => {
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;
    // Bacteria alone: a Basic Industry Facility is cheap, so many blocks fit,
    // but at 1,000 ISK against Test Cultures' 100,000 it does not out-earn it.
    expect(advice.best.typeId).toBe(TEST_CULTURES);
    expect(advice.best.marginPerHour).toBeCloseTo(433_400, 6);
    const margins = advice.entries
      .filter((entry) => entry.status === 'scored')
      .map((entry) => entry.marginPerHour);
    expect(Math.max(...margins)).toBeCloseTo(advice.best.marginPerHour, 6);
  });

  it('reports the pins a scored layout would actually be built from', () => {
    // `blocks` alone is a ratio count, which is not something a pilot can go
    // and place. The Advisor states a build as the pins it takes — "2x
    // Extractor Control Unit -> 8x Basic Industry Facility" — so the fit's own
    // flattened counts have to survive scoring rather than being discarded
    // with the rest of the `ColonyFit`.
    const advice = recommendStopTier(options(), pi);
    expect(advice.kind).toBe('recommended');
    if (advice.kind !== 'recommended') return;

    const { pins } = advice.best;
    // Every layout exports, so the overhead's Launchpad is always in there.
    expect(pins.launchpad).toBeGreaterThan(0);
    // Test Cultures is a P2, so it runs both Basic and Advanced facilities off
    // this planet's own extraction.
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
    // The rest of the run still scored.
    expect(advice.entries.some((entry) => entry.status === 'scored')).toBe(true);
  });

  it('rejects a candidate whose flow overruns its own buffer', () => {
    // A week of buffer in one Launchpad is far more than 10,000 m3 holds.
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
    // Level 0 supplies 6,000 MW; a Launchpad and one Test Cultures block need
    // far more than that.
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
    /**
     * One price for every candidate a Temperate planet offers — the five P0 and
     * everything makeable from them. A partial map leaves some candidates
     * `needs-price`, which is its own blocker and would mask the one under test.
     */
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
      // Level 0 supplies 1,675 tf; a Launchpad alone draws 3,600.
      expect(blockerFrom({ budget: { cpu: 1_675, powergrid: 6_000 } })).toBe('does-not-fit');
    });

    it('blames the buffer when everything that fits would overflow it', () => {
      // A year of buffer fits in no launchpad, so every candidate overflows.
      expect(blockerFrom({ bufferHours: 24 * 365, prices: everythingAt(1_000) })).toBe(
        'throughput'
      );
    });

    it('blames the prices when everything fits, is quoted, and still loses money', () => {
      // Priced at a hair above zero, every tier is under water on customs tax
      // alone — and nothing is unfittable, unquoted or overflowing.
      expect(blockerFrom({ prices: everythingAt(0.01) })).toBe('unprofitable');
    });

    it('refuses to name one cause when the candidates disagree', () => {
      // Only Microorganisms is quoted, and it is quoted at a loss: that one
      // candidate is `scored`, the rest are `needs-price`. No single sentence
      // is true of all of them.
      expect(blockerFrom({ prices: { [MICROORGANISMS]: 0.01 } })).toBe('mixed');
    });
  });

  it('breaks a tie toward the lower tier, so the simpler colony wins', () => {
    // Price Bacteria so its colony earns exactly what the P2 colony does.
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
    // The tie tolerance is not transitive: A can tie B and B tie C while A and
    // C sit more than a tolerance apart. Applying it inside a sort comparator
    // makes that comparator inconsistent, and the winner then depends on how
    // the runtime happens to merge — it can elect A, which is not the top
    // margin and not tied with it.
    //
    // Three extractor candidates, each fitting three ECUs at 6,000/hr, so
    // 18,000 units an hour and a tie tolerance of about 18 ISK on the margin.
    // Spaced 12 ISK apart: each neighbour ties, the ends do not.
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
    // Complex Organisms earns the most; Aqueous Liquids ties it and has the
    // lower typeID, so the rule elects Aqueous Liquids. Microorganisms is a
    // tolerance clear of the top and must never win, however near it is to the
    // candidate in the middle.
    expect(advice.best.typeId).toBe(AQUEOUS_LIQUIDS);
    expect(advice.best.marginPerHour).toBeGreaterThan(18_000 * (999.5 + step) - 1);
  });

  describe('extra extractors do not yield the measured mean rate (issue #957)', () => {
    it('leaves a one-extractor fit unchanged, whatever the factor', () => {
      // Test Cultures fits exactly one block at the default options — see
      // "scores a made tier..." above for the derivation.
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
      // Microorganisms at 500 ISK fits three ECUs at the default options — see
      // "scores selling the raw resource..." above. At factor 1 (no falloff)
      // that is 3 * 6,000 = 18,000/hr; at 0.5, the second and third extractor
      // each count for half: 6,000 * (1 + 2 * 0.5) = 12,000/hr.
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
      // Per-unit margin is untouched — only the colony's output is.
      expect(advice.best.marginPerUnit).toBeCloseTo(499.5, 6);
      expect(advice.best.marginPerHour).toBeCloseTo(12_000 * 499.5, 6);
    });

    it('reduces a made-tier candidate at the same extractor count by the same factor', () => {
      // Bacteria fits three blocks (three ECUs, one per block, same as the
      // raw case above) at the default options — see "scores the whole
      // colony..." above. The whole point of #957 is that this candidate
      // must pay the same falloff the raw one does, at the same block count,
      // so the raw-vs-made tie-break only moves by the part this ticket is
      // about.
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
      // 120/hr at factor 1 (3 * 40), reduced to 120 * (1 + 2*0.5)/3 = 80/hr.
      expect(bacteriaBefore.unitsPerHour).toBe(120);
      expect(bacteriaAfter.unitsPerHour).toBeCloseTo(80, 6);
      // Per-unit margin is untouched by the falloff.
      expect(bacteriaAfter.marginPerUnit).toBeCloseTo(bacteriaBefore.marginPerUnit, 6);

      // The made-tier reduction ratio at three extractors must equal the raw
      // candidate's reduction ratio at three extractors — the same fit, the
      // same factor, so the same ratio, independent of either candidate's
      // own price or margin.
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
      // Sanity check that the default is actually a falloff, not a no-op —
      // otherwise this test would pass even if the default were 1.
      expect(DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR).toBeLessThan(1);
    });

    it('keys a made-tier candidate’s falloff on its true extractor count, not on blocks', () => {
      // At the default 6,000/hr, Bacteria's own per-factory demand for
      // Microorganisms (150/unit * 40 units/hr = 6,000/hr) exactly matches the
      // extraction rate, so one ratio block needs exactly one ECU and `blocks`
      // and "true extractor count" happen to coincide — which is why the test
      // above this one cannot tell them apart. Halving the rate forces two
      // ECUs of Microorganisms into every block (`pinBudget.ts`'s
      // `chainBlockPins` ceils each P0 type's own demand against the rate), so
      // a made candidate's real extractor count is now double its `blocks` —
      // exactly the case `madeTierFalloffRatio` exists to get right rather
      // than silently under-charging.
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

      // Confirms the premise: each block now carries 2 ECUs of Microorganisms,
      // not 1, so `blocks` alone is not this candidate's true extractor count.
      expect(before.pins.extractorControlUnit).toBe(2 * before.blocks);

      const trueExtractorCount = before.pins.extractorControlUnit ?? 0;
      const expectedRatio = (1 + (trueExtractorCount - 1) * 0.5) / trueExtractorCount;
      expect(after.unitsPerHour / before.unitsPerHour).toBeCloseTo(expectedRatio, 10);

      // The bug this guards against: keying the ratio on `blocks` instead of
      // the true count would compute a shallower (larger) ratio than the
      // correct one, since blocks < trueExtractorCount here.
      const wrongRatioKeyedOnBlocks = (1 + (before.blocks - 1) * 0.5) / before.blocks;
      expect(expectedRatio).toBeLessThan(wrongRatioKeyedOnBlocks);
    });
  });
});
