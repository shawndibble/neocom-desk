import { orderBadgeFor, type OrderBadgeChoice } from './orderBadgeKind';
import { orderRowSummary, type OrderAdviceInput, type OrderRowSummary } from './orderRowSummary';
import { orderVerdict, type OrderVerdict } from './orderVerdict';

export type { OrderAdviceInput };

export interface OrderAdvice {
  badge: OrderBadgeChoice | null;
  summary: OrderRowSummary | null;
  verdict: OrderVerdict | null;
}

export function adviseOrder(row: OrderAdviceInput): OrderAdvice {
  const summary = orderRowSummary(row);
  return {
    badge: orderBadgeFor(row),
    summary,
    verdict: orderVerdict(row, summary),
  };
}
