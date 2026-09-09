import { describe, it, expect } from 'vitest';
import { SP_EXTRACTION_FLOOR_SP, extractableSp, isSpExtractionReady } from './spExtraction';

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
