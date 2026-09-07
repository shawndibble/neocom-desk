import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  usePriceHistoryRange,
  PRICE_HISTORY_RANGE_KEY,
  DEFAULT_PRICE_HISTORY_RANGE,
} from './priceHistoryRangePref';

beforeEach(async () => {
  await db.settings.clear();
  usePriceHistoryRange.setState({ value: DEFAULT_PRICE_HISTORY_RANGE, hydrated: false });
});

describe('usePriceHistoryRange', () => {
  it('defaults to 30 days, unhydrated — the chart’s window before this was persisted', () => {
    expect(usePriceHistoryRange.getState().value).toBe('30d');
    expect(usePriceHistoryRange.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under the marketPriceHistoryRange key', async () => {
    await usePriceHistoryRange.getState().setValue('1y');
    expect((await db.settings.get(PRICE_HISTORY_RANGE_KEY))?.value).toBe('1y');
  });

  it('applies a persisted range on hydrate', async () => {
    await db.settings.put({ key: PRICE_HISTORY_RANGE_KEY, value: '7d' });
    await usePriceHistoryRange.getState().hydrate();
    expect(usePriceHistoryRange.getState().value).toBe('7d');
  });

  /**
   * A range dropped between releases is still a string, so the `typeof`
   * default would wave it through — and one the filter has no day count for
   * draws an empty chart instead of failing loudly.
   */
  it('falls back to 30 days for a range the filter no longer knows', async () => {
    await db.settings.put({ key: PRICE_HISTORY_RANGE_KEY, value: '5y' });
    await usePriceHistoryRange.getState().hydrate();
    expect(usePriceHistoryRange.getState().value).toBe(DEFAULT_PRICE_HISTORY_RANGE);
  });

  it('falls back to 30 days when the stored value is not a string at all', async () => {
    await db.settings.put({ key: PRICE_HISTORY_RANGE_KEY, value: 90 });
    await usePriceHistoryRange.getState().hydrate();
    expect(usePriceHistoryRange.getState().value).toBe(DEFAULT_PRICE_HISTORY_RANGE);
  });
});
