import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  usePriceBasis,
  PRICE_BASIS_SETTING_KEY,
  DEFAULT_PRICE_BASIS,
  lpPricesAtPercent,
} from './priceBasis';

beforeEach(async () => {
  await db.settings.clear();
  usePriceBasis.setState({ value: DEFAULT_PRICE_BASIS, hydrated: false });
});

describe('usePriceBasis', () => {
  it('defaults to "sell", unhydrated', () => {
    expect(usePriceBasis.getState().value).toBe('sell');
    expect(usePriceBasis.getState().hydrated).toBe(false);
  });

  it('persists a "buy" choice to Dexie under the loyaltyStorePriceBasis key', async () => {
    await usePriceBasis.getState().setValue('buy');
    expect((await db.settings.get(PRICE_BASIS_SETTING_KEY))?.value).toBe('buy');
  });

  it('applies a persisted "buy" value on hydrate', async () => {
    await db.settings.put({ key: PRICE_BASIS_SETTING_KEY, value: 'buy' });
    await usePriceBasis.getState().hydrate();
    expect(usePriceBasis.getState().value).toBe('buy');
  });

  it('falls back to the default when the stored value is neither "sell" nor "buy"', async () => {
    await db.settings.put({ key: PRICE_BASIS_SETTING_KEY, value: 'bogus' });
    await usePriceBasis.getState().hydrate();
    expect(usePriceBasis.getState().value).toBe(DEFAULT_PRICE_BASIS);
  });
});

describe('lpPricesAtPercent', () => {
  const snapshot = { hubPrices: { 1: 1000 }, hubBuyPrices: { 1: 800 }, regionalTaxPct: 0 };
  const traded = new Map([
    [1, { recentSalePrice: 500, latestDay: { date: '2026-11-20', highest: 600, lowest: 400 } }],
  ]);

  it('scales both sides of the book and the recent trades to the percent', () => {
    const priced = lpPricesAtPercent(snapshot, traded, 90);
    expect(priced.snapshot.hubPrices[1]).toBe(900);
    expect(priced.snapshot.hubBuyPrices[1]).toBe(720);
    expect(priced.snapshot.regionalTaxPct).toBe(0);
    expect(priced.tradedPrices?.get(1)).toEqual({
      recentSalePrice: 450,
      latestDay: { date: '2026-11-20', highest: 540, lowest: 360 },
    });
  });

  it('hands the inputs back untouched at 100', () => {
    const priced = lpPricesAtPercent(snapshot, traded, 100);
    expect(priced.snapshot).toBe(snapshot);
    expect(priced.tradedPrices).toBe(traded);
  });
});
