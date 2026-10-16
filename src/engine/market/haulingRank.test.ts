import { describe, expect, it } from 'vitest';
import { HAULING_THRESHOLDS } from './haulingMarket';
import { historyScore, priceScore, ROUGH_FEE_FACTOR } from './haulingRank';

describe('priceScore', () => {
  it('ranks a bulk steady seller over a high-ratio item with thin stock', () => {
    // 3x the price, but two units on the market at the cheaper end.
    const thin = priceScore({ buy: 1_000_000, sell: 3_000_000, originListed: 2, destListed: 500 });
    // 1.2x the price, thousands listed at both ends.
    const bulk = priceScore({
      buy: 10_000,
      sell: 12_000,
      originListed: 40_000,
      destListed: 25_000,
    });
    expect(bulk).toBeGreaterThan(thin);
  });

  it('is the gap after the rough fee times the smaller listed volume', () => {
    expect(priceScore({ buy: 100, sell: 200, originListed: 50, destListed: 30 })).toBeCloseTo(
      (200 * ROUGH_FEE_FACTOR - 100) * 30
    );
  });

  it('is at most zero when the gap does not survive the fee, and ranks below any profit', () => {
    const loss = priceScore({
      buy: 100,
      sell: 104,
      originListed: 1_000_000,
      destListed: 1_000_000,
    });
    const breakEven = priceScore({
      buy: 94,
      sell: 100,
      originListed: 1_000_000,
      destListed: 1_000_000,
    });
    const small = priceScore({ buy: 100, sell: 120, originListed: 1, destListed: 1 });
    expect(loss).toBeLessThanOrEqual(0);
    expect(breakEven).toBeLessThanOrEqual(0);
    expect(small).toBeGreaterThan(loss);
    expect(small).toBeGreaterThan(breakEven);
  });

  it('is capped by what the origin lists: units nobody sells cannot be hauled', () => {
    const few = priceScore({ buy: 100, sell: 200, originListed: 10, destListed: 10_000 });
    const many = priceScore({ buy: 100, sell: 200, originListed: 1_000, destListed: 10_000 });
    expect(many).toBeGreaterThan(few);
  });

  it('scores nothing when either end lists nothing', () => {
    expect(priceScore({ buy: 100, sell: 200, originListed: 0, destListed: 500 })).toBe(0);
    expect(priceScore({ buy: 100, sell: 200, originListed: 500, destListed: 0 })).toBe(0);
  });

  it('reads the buy-side volume for an instant sale: the caller passes it as destListed', () => {
    // Same prices, same origin stock: only the destination buy orders differ.
    const deepBuyers = priceScore({ buy: 100, sell: 150, originListed: 1_000, destListed: 800 });
    const shallowBuyers = priceScore({ buy: 100, sell: 150, originListed: 1_000, destListed: 5 });
    expect(deepBuyers).toBeGreaterThan(shallowBuyers);
  });
});

describe('historyScore', () => {
  const { horizonDays, ownShareOfDemand } = HAULING_THRESHOLDS;

  it("is the unit profit at the recent sale price times a lot: a share of the horizon's sales", () => {
    const score = historyScore({
      buy: 100,
      recentSalePrice: 200,
      dailyVolume: 1_000,
      originListed: 1_000_000,
    });
    const lot = Math.floor(1_000 * horizonDays * ownShareOfDemand);
    expect(score).toBeCloseTo((200 * ROUGH_FEE_FACTOR - 100) * lot);
  });

  it('ranks a bulk steady seller over a high-ratio item that barely trades', () => {
    const thin = historyScore({
      buy: 1_000_000,
      recentSalePrice: 3_000_000,
      dailyVolume: 1,
      originListed: 50,
    });
    const bulk = historyScore({
      buy: 10_000,
      recentSalePrice: 12_000,
      dailyVolume: 5_000,
      originListed: 100_000,
    });
    expect(bulk).toBeGreaterThan(thin);
  });

  it('caps the lot at what the origin lists', () => {
    const capped = historyScore({
      buy: 100,
      recentSalePrice: 200,
      dailyVolume: 1_000,
      originListed: 10,
    });
    expect(capped).toBeCloseTo((200 * ROUGH_FEE_FACTOR - 100) * 10);
  });

  it('is at most zero when the recent sale price does not cover the buy and fee', () => {
    expect(
      historyScore({ buy: 100, recentSalePrice: 100, dailyVolume: 1_000, originListed: 1_000 })
    ).toBeLessThanOrEqual(0);
  });

  it('reads its horizon and share from the thresholds it is given', () => {
    const input = { buy: 100, recentSalePrice: 200, dailyVolume: 100, originListed: 1_000_000 };
    const wider = historyScore(input, { ...HAULING_THRESHOLDS, horizonDays: horizonDays * 2 });
    expect(wider).toBeGreaterThan(historyScore(input));
  });
});
