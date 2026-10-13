/**
 * Everything an Open Orders row says about what to do: the badge, the one
 * fact beside it, the verdict and the next step. One call derives all four
 * from a single `orderRowSummary`, so the detail modal's header, verdict and
 * next-step lines can never disagree (the verdict's price is the same
 * legal tick the next step quotes — see `orderNextAction`).
 *
 * Lives in features/market, not the engine: the badge kind type comes from
 * the `OrderProblemBadge` component and `OrderAdviceInput` slices the feature's
 * `OpenOrderRow`.
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
