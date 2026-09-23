import type { MarketOrderHistory } from '@/esi/endpoints';
import { optionalEnumParam, textParam } from '@/lib/urlState';

export interface HistoryFilter {
  text: string;
  side: 'buy' | 'sell' | null;
  state: MarketOrderHistory['state'] | null;
}

export const EMPTY_HISTORY_FILTER: HistoryFilter = { text: '', side: null, state: null };

/**
 * The History tab's filter bar, in the URL (ADR 0015), scoped `history.*` so
 * it can never collide with another panel's params on `/market/history`.
 */
export const HISTORY_FILTER_PARAMS = {
  'history.q': textParam(),
  'history.side': optionalEnumParam<'buy' | 'sell'>(['buy', 'sell']),
  'history.state': optionalEnumParam<MarketOrderHistory['state']>(['cancelled', 'expired']),
};

export function filterHistory(
  history: readonly MarketOrderHistory[],
  filter: HistoryFilter,
  typeNames: ReadonlyMap<number, string>
): MarketOrderHistory[] {
  const query = filter.text.trim().toLowerCase();
  return history.filter((order) => {
    if (filter.side === 'buy' && !order.is_buy_order) return false;
    if (filter.side === 'sell' && order.is_buy_order) return false;
    if (filter.state && order.state !== filter.state) return false;
    if (query && !(typeNames.get(order.type_id) ?? '').toLowerCase().includes(query)) return false;
    return true;
  });
}

/** Active-filter count for the `FilterBar` trigger. Excludes text — the search box stays visible in the row, not behind the trigger. */
export function activeHistoryFilterCount(filter: HistoryFilter): number {
  return [filter.side, filter.state].filter((v) => v !== null).length;
}
