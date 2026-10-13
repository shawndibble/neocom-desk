/**
 * One `orderRowSummary` feeds badge, verdict and next step so the modal's lines can't disagree.
 * In features/market, not engine: the badge kind type comes from the `OrderProblemBadge` component.
 */
import { orderBadgeFor, type OrderBadgeChoice } from './orderBadgeKind';
import { orderNextAction, type NextAction } from './orderNextAction';
import { orderRowSummary, type OrderAdviceInput, type OrderRowSummary } from './orderRowSummary';
import { orderVerdict, type OrderVerdict } from './orderVerdict';

export type { OrderAdviceInput };

export interface OrderAdvice {
  badge: OrderBadgeChoice | null;
  summary: OrderRowSummary | null;
  verdict: OrderVerdict | null;
  next: NextAction;
}

export function adviseOrder(row: OrderAdviceInput): OrderAdvice {
  const summary = orderRowSummary(row);
  const verdict = orderVerdict(row, summary);
  return {
    badge: orderBadgeFor(row),
    summary,
    verdict,
    next: orderNextAction(row, verdict, summary),
  };
}
