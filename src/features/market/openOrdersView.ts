/**
 * What the Open Orders panel renders: the visible/grouping row splits, the
 * groups, their summaries, whether the match-count line shows, and whether
 * a given group is folded. One testable shape for the panel to render.
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
  /** False only when rows are hidden by the healthy fold alone — that's not a failed match (issue #2032). */
  matchCountVisible: boolean;
}

function sortedFilter(rows: readonly OpenOrderRow[], filter: OpenOrdersFilter): OpenOrderRow[] {
  return sortOpenOrders(filterOpenOrders(rows, filter), filter.sort);
}

export function buildOpenOrdersView(
  rows: readonly OpenOrderRow[],
  filter: OpenOrdersFilter
): OpenOrdersView {
  const visibleRows = sortedFilter(rows, filter);
  const groupingRows = sortedFilter(rows, { ...filter, hideHealthy: false });
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
