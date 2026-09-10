import { describe, it, expect } from 'vitest';
import type { MarketOrderHistory } from '@/esi/endpoints';
import {
  activeHistoryFilterCount,
  EMPTY_HISTORY_FILTER,
  filterHistory,
  type HistoryFilter,
} from './orderHistoryFilter';

function order(overrides: Partial<MarketOrderHistory> = {}): MarketOrderHistory {
  return {
    order_id: 1,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_buy_order: false,
    is_corporation: false,
    price: 5.5,
    volume_remain: 0,
    volume_total: 100,
    issued: '2026-08-01T00:00:00Z',
    duration: 90,
    range: 'region',
    state: 'expired',
    ...overrides,
  };
}

const typeNames = new Map([
  [34, 'Tritanium'],
  [35, 'Pyerite'],
]);

describe('filterHistory', () => {
  it('returns every row unchanged when the filter is empty', () => {
    const rows = [order({ order_id: 1 }), order({ order_id: 2 })];
    expect(filterHistory(rows, EMPTY_HISTORY_FILTER, typeNames)).toEqual(rows);
  });

  it('keeps only rows matching the selected side', () => {
    const rows = [
      order({ order_id: 1, is_buy_order: true }),
      order({ order_id: 2, is_buy_order: false }),
    ];
    const filter: HistoryFilter = { ...EMPTY_HISTORY_FILTER, side: 'buy' };
    expect(filterHistory(rows, filter, typeNames).map((o) => o.order_id)).toEqual([1]);
  });

  it('keeps only rows matching the selected state', () => {
    const rows = [
      order({ order_id: 1, state: 'expired' }),
      order({ order_id: 2, state: 'cancelled' }),
    ];
    const filter: HistoryFilter = { ...EMPTY_HISTORY_FILTER, state: 'cancelled' };
    expect(filterHistory(rows, filter, typeNames).map((o) => o.order_id)).toEqual([2]);
  });

  it('matches free text against the resolved type name, case-insensitively', () => {
    const rows = [order({ order_id: 1, type_id: 34 }), order({ order_id: 2, type_id: 35 })];
    const filter: HistoryFilter = { ...EMPTY_HISTORY_FILTER, text: 'trit' };
    expect(filterHistory(rows, filter, typeNames).map((o) => o.order_id)).toEqual([1]);
  });

  it('falls back to an empty name when the type id has no resolved name', () => {
    const rows = [order({ order_id: 1, type_id: 99 })];
    const filter: HistoryFilter = { ...EMPTY_HISTORY_FILTER, text: 'trit' };
    expect(filterHistory(rows, filter, typeNames)).toEqual([]);
  });

  it('ANDs side, state and text together', () => {
    const rows = [
      order({ order_id: 1, type_id: 34, is_buy_order: true, state: 'expired' }),
      order({ order_id: 2, type_id: 34, is_buy_order: false, state: 'expired' }),
      order({ order_id: 3, type_id: 34, is_buy_order: true, state: 'cancelled' }),
    ];
    const filter: HistoryFilter = { text: 'trit', side: 'buy', state: 'expired' };
    expect(filterHistory(rows, filter, typeNames).map((o) => o.order_id)).toEqual([1]);
  });
});

describe('activeHistoryFilterCount', () => {
  it('is 0 when no filter is set', () => {
    expect(activeHistoryFilterCount({ text: '', side: null, state: null })).toBe(0);
  });

  it('counts side when set', () => {
    expect(activeHistoryFilterCount({ text: '', side: 'buy', state: null })).toBe(1);
  });

  it('counts state when set', () => {
    expect(activeHistoryFilterCount({ text: '', side: null, state: 'expired' })).toBe(1);
  });

  it('counts side and state together', () => {
    expect(activeHistoryFilterCount({ text: '', side: 'sell', state: 'cancelled' })).toBe(2);
  });

  it('excludes text — the search box stays visible in the row, not behind the trigger', () => {
    expect(activeHistoryFilterCount({ text: 'tritanium', side: null, state: null })).toBe(0);
  });
});
