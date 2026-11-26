import type { OrderProblem } from '@/engine/market/orderProblems';
import { orderGroupKey, type OpenOrderRow, type OrderGroupKey } from './openOrdersModel';

export type OrderUrgency = 'act' | 'watch' | 'fine';

export const OPEN_ORDERS_VIEWS = ['act', 'watch', 'all'] as const;
export type OpenOrdersView = (typeof OPEN_ORDERS_VIEWS)[number];

const URGENCY: Record<OrderGroupKey, OrderUrgency> = {
  belowFloor: 'act',
  undercutStation: 'act',
  outbid: 'act',
  expiringOrStale: 'act',
  undercutSystem: 'watch',
  undercutRegion: 'watch',
  notChecked: 'watch',
  turnInPays: 'watch',
  healthy: 'fine',
};

export function problemUrgency(problem: OrderProblem): OrderUrgency {
  return URGENCY[problem];
}

export function orderUrgency(row: OpenOrderRow): OrderUrgency {
  return URGENCY[orderGroupKey(row)];
}

export function rowInView(row: OpenOrderRow, view: OpenOrdersView): boolean {
  return view === 'all' || orderUrgency(row) === view;
}

export function viewForProblems(problems: readonly OrderProblem[]): OpenOrdersView {
  const urgencies = new Set(problems.map(problemUrgency));
  if (urgencies.size === 0 || (urgencies.size === 1 && urgencies.has('act'))) return 'act';
  if (urgencies.size === 1 && urgencies.has('watch')) return 'watch';
  return 'all';
}
