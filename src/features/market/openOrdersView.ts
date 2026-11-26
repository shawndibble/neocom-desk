import type { OpenOrderRow } from './openOrdersModel';
import { filterOpenOrders, sortOpenOrders } from './openOrdersFilter';
import type { OpenOrdersFilter } from './openOrdersFilter';
import { orderUrgency, rowInView, type OpenOrdersView, type OrderUrgency } from './orderUrgency';

export interface OpenOrdersFixList {
  matching: OpenOrderRow[];
  act: OpenOrderRow[];
  watch: OpenOrderRow[];
  fine: OpenOrderRow[];
  actIskTiedUp: number;
  matchingIskTiedUp: number;
}

export function buildOpenOrdersView(
  rows: readonly OpenOrderRow[],
  filter: OpenOrdersFilter
): OpenOrdersFixList {
  const sorted = sortOpenOrders(filterOpenOrders(rows, filter), filter.sort);
  const buckets: Record<OrderUrgency, OpenOrderRow[]> = { act: [], watch: [], fine: [] };
  for (const row of sorted) buckets[orderUrgency(row)].push(row);
  const { act, watch, fine } = buckets;
  return {
    matching: filter.sort === 'worstFirst' ? [...act, ...watch, ...fine] : sorted,
    act,
    watch,
    fine,
    actIskTiedUp: act.reduce((sum, row) => sum + row.iskTiedUp, 0),
    matchingIskTiedUp: sorted.reduce((sum, row) => sum + row.iskTiedUp, 0),
  };
}

export function shownView(view: OpenOrdersView, reveal: OpenOrderRow | null): OpenOrdersView {
  return reveal !== null && !rowInView(reveal, view) ? 'all' : view;
}
