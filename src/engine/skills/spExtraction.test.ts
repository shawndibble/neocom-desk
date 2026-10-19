import { describe, it, expect } from 'vitest';
import {
  SP_EXTRACTION_FLOOR_SP,
  extractableSp,
  extractionNet,
  extractionTotalIsk,
  extractorCount,
  isSpExtractionReady,
} from './spExtraction';

describe('extractableSp', () => {
  it('is zero at or below the floor', () => {
    expect(extractableSp(SP_EXTRACTION_FLOOR_SP)).toBe(0);
    expect(extractableSp(SP_EXTRACTION_FLOOR_SP - 1)).toBe(0);
    expect(extractableSp(0)).toBe(0);
  });

  it('is the amount above the floor', () => {
    expect(extractableSp(SP_EXTRACTION_FLOOR_SP + 500_000)).toBe(500_000);
    expect(extractableSp(6_000_000)).toBe(1_000_000);
  });
});

describe('isSpExtractionReady', () => {
  it('is false for a fresh character nowhere near the floor', () => {
    // The bug this guards against: a naive `totalSp >= threshold` check on
    // the default 500k threshold would flag every character within days of
    // creation. The floor must be crossed first.
    expect(isSpExtractionReady(1_000_000, 500_000)).toBe(false);
  });

  it('is false just below the floor plus one chunk', () => {
    expect(isSpExtractionReady(SP_EXTRACTION_FLOOR_SP + 499_999, 500_000)).toBe(false);
  });

  it('is true once extractable SP reaches the threshold', () => {
    expect(isSpExtractionReady(SP_EXTRACTION_FLOOR_SP + 500_000, 500_000)).toBe(true);
  });

  it('respects a custom (higher) threshold', () => {
    expect(isSpExtractionReady(SP_EXTRACTION_FLOOR_SP + 999_999, 1_000_000)).toBe(false);
    expect(isSpExtractionReady(SP_EXTRACTION_FLOOR_SP + 1_000_000, 1_000_000)).toBe(true);
  });
});

describe('extractorCount', () => {
  it('counts whole extractors above the floor', () => {
    expect(extractorCount(SP_EXTRACTION_FLOOR_SP + 1_250_000)).toBe(2);
  });

  it('is zero at or below the floor', () => {
    expect(extractorCount(SP_EXTRACTION_FLOOR_SP)).toBe(0);
    expect(extractorCount(1_000_000)).toBe(0);
  });

  it('steps at each 500k chunk above 5M SP', () => {
    expect(extractorCount(5_499_999)).toBe(0);
    expect(extractorCount(5_500_000)).toBe(1);
    expect(extractorCount(5_999_999)).toBe(1);
  });
});

describe('extractionNet', () => {
  it('is injector sell minus extractor cost', () => {
    expect(extractionNet(900, 300)).toBe(600);
  });

  it('keeps a negative net as is', () => {
    expect(extractionNet(300, 900)).toBe(-600);
  });

  it('is null when either price is missing, never 0', () => {
    expect(extractionNet(null, 300)).toBeNull();
    expect(extractionNet(900, null)).toBeNull();
  });
});

describe('extractionTotalIsk', () => {
  it('multiplies the net by the whole extractors the SP fills', () => {
    expect(extractionTotalIsk(SP_EXTRACTION_FLOOR_SP + 1_200_000, 600)).toBe(1_200);
  });

  it('is 0 with no extractor ready, and null when unpriced', () => {
    expect(extractionTotalIsk(SP_EXTRACTION_FLOOR_SP, 600)).toBe(0);
    expect(extractionTotalIsk(SP_EXTRACTION_FLOOR_SP + 1_000_000, null)).toBeNull();
  });
});
