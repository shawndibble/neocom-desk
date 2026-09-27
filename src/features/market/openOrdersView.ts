/**
 * What the Open Orders panel renders, derived once from `allRows` + the
 * filter: the visible/grouping row splits, the groups, their summaries, and
 * whether the match-count line shows at all. The panel used to re-derive
 * this inline from `filterOpenOrders`/`groupOpenOrders` calls scattered
 * across several `useMemo`s — the healthy-fold edge case (issue #2032, "0 of
 * N" reading as a broken filter when everything that matched was folded, not
 * absent) was fixed as an ad hoc boolean at the render site because nothing
 * here was a single, testable shape. This module is that shape.
 */
import { groupOpenOrders, summariseOrderGroup } from './openOrdersModel';
import type { OpenOrderGroupSummary, OpenOrderRow, OrderGroup } from './openOrdersModel';
import { filterOpenOrders, sortOpenOrders } from './openOrdersFilter';
import type { OpenOrdersFilter } from './openOrdersFilter';
import type { OrderProblem } from '@/engine/market/orderProblems';

export interface OpenOrdersView {
  /** Every row matching the filter as given, sorted. What the match-count line counts. */
  visibleRows: OpenOrderRow[];
  /**
   * Every row matching the filter except `hideHealthy`, sorted. Healthy
   * orders are FOLDED, not filtered out (CONTEXT.md): grouping always sees
   * them so the healthy group's own heading and count still render — just
   * without its table — while `hideHealthy` is on.
   */
  groupingRows: OpenOrderRow[];
  groups: OrderGroup[];
  groupSummaries: Map<OrderProblem, OpenOrderGroupSummary>;
  /**
   * Rows hidden only by the healthy fold are not a failed match — when
   * everything that matches is folded away, "0 of N orders match" would read
   * as a broken filter, so the count steps aside and the folded healthy
   * group speaks for itself instead.
   */
  matchCountVisible: boolean;
}

export function buildOpenOrdersView(
  rows: readonly OpenOrderRow[],
  filter: OpenOrdersFilter
): OpenOrdersView {
  const visibleRows = sortOpenOrders(filterOpenOrders(rows, filter), filter.sort);
  const groupingRows = sortOpenOrders(
    filterOpenOrders(rows, { ...filter, hideHealthy: false }),
    filter.sort
  );
  const groups = groupOpenOrders(groupingRows);
  const groupSummaries = new Map(
    groups.map((group) => [group.problem, summariseOrderGroup(group.rows)])
  );
  const matchCountVisible = visibleRows.length > 0 || groupingRows.length === 0;
  return { visibleRows, groupingRows, groups, groupSummaries, matchCountVisible };
}

/** The highlighted row's own group always wins over either fold mechanism (decision `20260924-...`, step 9). */
export function isGroupFolded(
  problem: OrderProblem,
  highlightedRow: OpenOrderRow | null,
  filter: OpenOrdersFilter,
  collapsedGroups: ReadonlySet<OrderProblem>
): boolean {
  if (problem === highlightedRow?.problem) return false;
  if (problem === 'healthy') return filter.hideHealthy;
  return collapsedGroups.has(problem);
}
