/**
 * What the Open Orders fix list renders: the rows the funnel matched, split
 * into the Needs you / Watch / Fine buckets the segments show and count. One
 * testable shape for the panel to render.
 */
import type { OpenOrderRow } from './openOrdersModel';
import { filterOpenOrders, sortOpenOrders } from './openOrdersFilter';
import type { OpenOrdersFilter } from './openOrdersFilter';
import { orderUrgency, rowInView, type OpenOrdersView, type OrderUrgency } from './orderUrgency';

export interface OpenOrdersFixList {
  /** Every row matching the funnel (any segment), sorted. What All shows. */
  matching: OpenOrderRow[];
  act: OpenOrderRow[];
  watch: OpenOrderRow[];
  fine: OpenOrderRow[];
  /** ISK tied up in the Needs you rows: the headline's quiet line. */
  actIskTiedUp: number;
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
    // Worst first means Needs you first: problem precedence alone would list a
    // region undercut (Watch) above an expiring order. A picked sort holds.
    matching: filter.sort === 'worstFirst' ? [...act, ...watch, ...fine] : sorted,
    act,
    watch,
    fine,
    actIskTiedUp: act.reduce((sum, row) => sum + row.iskTiedUp, 0),
  };
}

/**
 * The segment actually on screen: the picked one, widened to All while a row
 * the page must show (a notification's `?highlight=`, the work-through's
 * current order) sits outside it. Derived, never written to the URL, so it
 * cannot race `useHighlightParam`'s own URL write.
 */
export function shownView(view: OpenOrdersView, reveal: OpenOrderRow | null): OpenOrdersView {
  return reveal !== null && !rowInView(reveal, view) ? 'all' : view;
}
