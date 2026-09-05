import { describe, it, expect } from 'vitest';
import { assumedExtractionRate, estimateUnbuiltPlanet, rankedResources } from './richnessEstimate';

const MEASURED = [
  { typeId: 2073, unitsPerHour: 6_000 },
  { typeId: 2268, unitsPerHour: 4_000 },
];

describe('assumedExtractionRate', () => {
  it('reads the pilot’s own measured colonies rather than asking them to guess', () => {
    // The Plan tab asks for a rate because it must answer for a pilot with no
    // colonies at all. Here the pilot has colonies, and their own extractors
    // are a better answer than any figure they could type — so the estimate is
    // derived, and the card says so.
    expect(assumedExtractionRate(MEASURED)).toEqual({
      kind: 'measured-own-colonies',
      unitsPerHour: 5_000,
      sampleSize: 2,
    });
  });

  it('refuses when the pilot has no measured extraction at all', () => {
    // Not a zero, and not a made-up default. `advisorModel` already drops an
    // extractor whose program has no install-time baseline rather than
    // counting it as zero; the estimate has to refuse on the same terms or it
    // would price a planet off an empty set.
    expect(assumedExtractionRate([])).toEqual({ kind: 'no-measured-extraction' });
  });

  it('ignores a non-finite or negative rate rather than letting it poison the mean', () => {
    expect(
      assumedExtractionRate([
        { typeId: 2073, unitsPerHour: 6_000 },
        { typeId: 2268, unitsPerHour: Number.NaN },
        { typeId: 2270, unitsPerHour: -5 },
      ])
    ).toEqual({ kind: 'measured-own-colonies', unitsPerHour: 6_000, sampleSize: 1 });
  });
});

describe('rankedResources', () => {
  const local = [2073, 2268, 2270];

  it('puts the pilot’s ranking first, in their order', () => {
    expect(rankedResources(local, [2270, 2073])).toEqual([
      { typeId: 2270, rank: 1 },
      { typeId: 2073, rank: 2 },
      { typeId: 2268, rank: null },
    ]);
  });

  it('keeps an unranked resource unranked rather than sorting it last', () => {
    // "I have not scanned this" and "this is the worst here" are different
    // claims, and the second is one the app has no basis for.
    expect(rankedResources(local, []).every((entry) => entry.rank === null)).toBe(true);
  });

  it('drops a ranked resource the planet type does not actually yield', () => {
    // A stale ranking must not invent a resource. Planet types change between
    // patches; the planet's own resource list is the authority.
    expect(rankedResources(local, [9_999, 2073]).map((entry) => entry.typeId)).toEqual([
      2073, 2268, 2270,
    ]);
  });
});

describe('estimateUnbuiltPlanet', () => {
  const prices = { 2073: 10, 2268: 4 };

  it('prices the pilot’s best-ranked resource at the assumed rate', () => {
    const estimate = estimateUnbuiltPlanet({
      localResources: [2073, 2268],
      order: [2073],
      rate: { kind: 'measured-own-colonies', unitsPerHour: 5_000, sampleSize: 2 },
      prices,
    });

    expect(estimate).toEqual({
      kind: 'estimate',
      typeId: 2073,
      unitsPerHour: 5_000,
      iskPerHour: 50_000,
      rate: { kind: 'measured-own-colonies', unitsPerHour: 5_000, sampleSize: 2 },
    });
  });

  it('refuses when the planet has no ranking yet, keeping today’s behaviour', () => {
    expect(
      estimateUnbuiltPlanet({
        localResources: [2073, 2268],
        order: [],
        rate: { kind: 'measured-own-colonies', unitsPerHour: 5_000, sampleSize: 2 },
        prices,
      })
    ).toEqual({ kind: 'needs-ranking' });
  });

  it('refuses when there is no measured rate to project from', () => {
    expect(
      estimateUnbuiltPlanet({
        localResources: [2073, 2268],
        order: [2073],
        rate: { kind: 'no-measured-extraction' },
        prices,
      })
    ).toEqual({ kind: 'needs-measured-extraction' });
  });

  it('refuses when the best resource has no price, rather than valuing it at zero', () => {
    expect(
      estimateUnbuiltPlanet({
        localResources: [2073, 2268],
        order: [2073],
        rate: { kind: 'measured-own-colonies', unitsPerHour: 5_000, sampleSize: 2 },
        prices: {},
      })
    ).toEqual({ kind: 'needs-price', typeId: 2073 });
  });

  it('ignores a ranked resource this planet does not yield when picking the best', () => {
    const estimate = estimateUnbuiltPlanet({
      localResources: [2073, 2268],
      order: [9_999, 2268],
      rate: { kind: 'measured-own-colonies', unitsPerHour: 5_000, sampleSize: 2 },
      prices,
    });

    expect(estimate).toMatchObject({ kind: 'estimate', typeId: 2268, iskPerHour: 20_000 });
  });
});
