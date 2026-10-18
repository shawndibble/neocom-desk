import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS,
  leanPriceHistoryColumns,
  useVisiblePriceHistoryColumns,
  VISIBLE_PRICE_HISTORY_COLUMNS_KEY,
} from './priceHistoryColumns';

beforeEach(async () => {
  await db.settings.clear();
  useVisiblePriceHistoryColumns.setState({
    value: DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS,
    hydrated: false,
  });
});

describe('visible Price History columns', () => {
  it('shows everything by default', () => {
    expect(useVisiblePriceHistoryColumns.getState().value).toEqual(
      DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS
    );
  });

  it('persists a pick and reads it back on hydrate', async () => {
    await useVisiblePriceHistoryColumns.getState().setValue(['buy', 'volume']);
    expect((await db.settings.get(VISIBLE_PRICE_HISTORY_COLUMNS_KEY))?.value).toEqual([
      'buy',
      'volume',
    ]);
  });

  it('ignores a stored id it does not know', async () => {
    await db.settings.put({ key: VISIBLE_PRICE_HISTORY_COLUMNS_KEY, value: ['buy', 'nope'] });
    await useVisiblePriceHistoryColumns.getState().hydrate();
    expect(useVisiblePriceHistoryColumns.getState().value).toBe(
      DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS
    );
  });

  it('starts a phone lean: open buy and sell stand in for the average', () => {
    expect(leanPriceHistoryColumns(true)).toEqual(['buy', 'sell', 'volume']);
    expect(leanPriceHistoryColumns(false)).toEqual(['average', 'volume']);
  });
});
