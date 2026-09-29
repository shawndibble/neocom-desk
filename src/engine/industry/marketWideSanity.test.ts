import { describe, it, expect } from 'vitest';
import {
  RARELY_SOLD_PER_DAY,
  averageDailyVolume,
  isRarelySold,
  reliableSellPrice,
  TROLL_PRICE_RATIO,
} from './marketWideSanity';

describe('reliableSellPrice', () => {
  it('keeps the hub price when it is in line with what the item trades at', () => {
    expect(reliableSellPrice(120, 100)).toEqual({ price: 120, capped: false });
  });

  it('keeps a hub price right at the troll ratio', () => {
    expect(reliableSellPrice(100 * TROLL_PRICE_RATIO, 100)).toEqual({
      price: 100 * TROLL_PRICE_RATIO,
      capped: false,
    });
  });

  it('prices at the average instead when the cheapest order is a troll price', () => {
    // Miasmos Quafe Ultramarine Edition: a sell order at 1000x what it trades for.
    expect(reliableSellPrice(100_000, 100)).toEqual({ price: 100, capped: true });
  });

  it('has no reliable price for an item that has never traded', () => {
    expect(reliableSellPrice(100_000, null)).toBeNull();
    expect(reliableSellPrice(100_000, 0)).toBeNull();
  });

  it('has no price with no sell order', () => {
    expect(reliableSellPrice(null, 100)).toBeNull();
  });
});

const day = (date: string, volume: number) => ({
  date,
  average: 1,
  highest: 1,
  lowest: 1,
  volume,
  orderCount: 1,
});
const NOW = Date.parse('2026-09-29T12:00:00Z');

describe('averageDailyVolume', () => {
  it('averages the last 30 days over every day, counting days with no trades as zero', () => {
    const history = [day('2026-09-28', 30), day('2026-09-20', 60)];
    expect(averageDailyVolume([history], NOW)).toBeCloseTo(90 / 30);
  });

  it('ignores days older than the window', () => {
    expect(averageDailyVolume([[day('2026-07-01', 10_000)]], NOW)).toBe(0);
  });

  it('sums every region’s history', () => {
    const forge = [day('2026-09-28', 150)];
    const domain = [day('2026-09-28', 30)];
    expect(averageDailyVolume([forge, domain], NOW)).toBeCloseTo(6);
  });
});

describe('isRarelySold', () => {
  it('is true under the threshold and false at or above it', () => {
    expect(isRarelySold(RARELY_SOLD_PER_DAY - 0.1)).toBe(true);
    expect(isRarelySold(RARELY_SOLD_PER_DAY)).toBe(false);
  });
});
