import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  usePriceHistorySeries,
  PRICE_HISTORY_SERIES_KEY,
  DEFAULT_PRICE_HISTORY_SERIES,
} from './priceHistorySeriesPref';

beforeEach(async () => {
  await db.settings.clear();
  usePriceHistorySeries.setState({ value: DEFAULT_PRICE_HISTORY_SERIES, hydrated: false });
});

describe('usePriceHistorySeries', () => {
  it('defaults to both sides', () => {
    expect(usePriceHistorySeries.getState().value).toBe('both');
  });

  it('persists under marketPriceHistorySeries and applies it on hydrate', async () => {
    await usePriceHistorySeries.getState().setValue('sell');
    expect((await db.settings.get(PRICE_HISTORY_SERIES_KEY))?.value).toBe('sell');
    usePriceHistorySeries.setState({ value: 'both', hydrated: false });
    await usePriceHistorySeries.getState().hydrate();
    expect(usePriceHistorySeries.getState().value).toBe('sell');
  });

  it('loads a stored average', async () => {
    await db.settings.put({ key: PRICE_HISTORY_SERIES_KEY, value: 'average' });
    await usePriceHistorySeries.getState().hydrate();
    expect(usePriceHistorySeries.getState().value).toBe('average');
  });

  it('falls back to both for a value it does not know', async () => {
    await db.settings.put({ key: PRICE_HISTORY_SERIES_KEY, value: 'median' });
    await usePriceHistorySeries.getState().hydrate();
    expect(usePriceHistorySeries.getState().value).toBe('both');
  });
});
