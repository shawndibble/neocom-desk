import { describe, expect, it } from 'vitest';
import { iskPerDay } from './iskPerDay';

const DAY = 86_400;

describe('iskPerDay', () => {
  it('is build-capped when the market can absorb more than one slot builds', () => {
    // 1 unit/hour = 24/day; market sells 1000/day x 10% = 100/day.
    expect(
      iskPerDay({
        unitMargin: 1000,
        outputQuantity: 1,
        jobSeconds: 3600,
        averageDailyVolume: 1000,
        sharePct: 10,
      })
    ).toBe(24_000);
  });

  it('is volume-capped when the market absorbs fewer than one slot builds', () => {
    // 24 built/day, but 30/day x 10% = 3 sellable.
    expect(
      iskPerDay({
        unitMargin: 1000,
        outputQuantity: 1,
        jobSeconds: 3600,
        averageDailyVolume: 30,
        sharePct: 10,
      })
    ).toBe(3000);
  });

  it('ranks a volume-capped row below a build-capped row of equal margin and time', () => {
    const base = { unitMargin: 500, outputQuantity: 1, jobSeconds: 3600, sharePct: 10 };
    const capped = iskPerDay({ ...base, averageDailyVolume: 3 });
    const free = iskPerDay({ ...base, averageDailyVolume: 10_000 });
    expect(capped).not.toBeNull();
    expect(free).not.toBeNull();
    expect(capped!).toBeLessThan(free!);
  });

  it('multiplies by units a job yields', () => {
    // 100 units per 1-day job, plenty of volume.
    expect(
      iskPerDay({
        unitMargin: 10,
        outputQuantity: 100,
        jobSeconds: DAY,
        averageDailyVolume: 1_000_000,
        sharePct: 10,
      })
    ).toBe(1000);
  });

  it('a larger share raises the volume cap', () => {
    const base = {
      unitMargin: 100,
      outputQuantity: 1,
      jobSeconds: 600,
      averageDailyVolume: 100,
    };
    expect(iskPerDay({ ...base, sharePct: 5 })).toBe(500);
    expect(iskPerDay({ ...base, sharePct: 25 })).toBe(2500);
  });

  it('keeps a negative margin negative, uncapped by volume', () => {
    expect(
      iskPerDay({
        unitMargin: -100,
        outputQuantity: 1,
        jobSeconds: 3600,
        averageDailyVolume: 30,
        sharePct: 10,
      })
    ).toBe(-2400);
  });

  it('is null for zero or unknown volume', () => {
    const base = { unitMargin: 100, outputQuantity: 1, jobSeconds: 3600, sharePct: 10 };
    expect(iskPerDay({ ...base, averageDailyVolume: 0 })).toBeNull();
    expect(iskPerDay({ ...base, averageDailyVolume: null })).toBeNull();
    expect(iskPerDay({ ...base, averageDailyVolume: undefined })).toBeNull();
  });

  it('is null for an unknown margin', () => {
    expect(
      iskPerDay({
        unitMargin: null,
        outputQuantity: 1,
        jobSeconds: 3600,
        averageDailyVolume: 100,
        sharePct: 10,
      })
    ).toBeNull();
  });

  it('is null when the job time is 0', () => {
    expect(
      iskPerDay({
        unitMargin: 100,
        outputQuantity: 1,
        jobSeconds: 0,
        averageDailyVolume: 100,
        sharePct: 10,
      })
    ).toBeNull();
  });
});
