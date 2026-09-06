import { describe, it, expect } from 'vitest';
import { assumedExtractionRate } from './richnessEstimate';

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
