import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { usePriceBasis, PRICE_BASIS_SETTING_KEY, DEFAULT_PRICE_BASIS } from './priceBasis';

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
