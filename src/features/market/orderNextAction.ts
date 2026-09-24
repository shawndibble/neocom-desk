/**
 * The one thing to actually type into the order — the detail modal's "Next
 * step" line (issue #1428).
 *
 * Deliberately distinct from `orderVerdict`'s own `price`: that field exists
 * only to make the verdict SENTENCE add up, so a `letGo` verdict's price is
 * illustrative ("undercutting to X would still lose you...") rather than a
 * recommendation to act on. `matchThem` reuses the verdict's price rather
 * than the raw rival price for the same reason in reverse — that price is
 * already the legal one-tick-under price (`undercutPrice`, issue #1421), and
 * the headline must not disagree with the verdict sentence that already
 * states this exact figure.
 */
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderVerdict } from './orderVerdict';
import { orderRowSummary } from './orderRowSummary';

export type NextAction =
  | { kind: 'raisePrice'; price: number }
  | { kind: 'matchThem'; price: number }
  | { kind: 'keepAt'; price: number }
  | { kind: 'cheapestRival'; price: number }
  | { kind: 'badgeAdvice' };

export function orderNextAction(row: OpenOrderRow, verdict: OrderVerdict | null): NextAction {
  if (verdict) {
    switch (verdict.kind) {
      case 'raisePrice':
      case 'matchThem':
        // `verdict.price` is only ever null for a degenerate floor
        // (`roundPriceUp` rejects it) — falling through to the cheapest-rival
        // or badge-advice branches below would show a DIFFERENT price than
        // whatever the verdict headline above still renders. `badgeAdvice`
        // (no Next step at all) is the only honest fallback here.
        return verdict.price !== null
          ? { kind: verdict.kind, price: verdict.price }
          : { kind: 'badgeAdvice' };
      case 'letGo':
      case 'leaveItAlone':
        return { kind: 'keepAt', price: row.price };
    }
  }

  // No verdict is reachable with no Order Floor — a buy order, or a sell
  // order with nothing linked. A known undercut is still a fact worth
  // stating even then, just never as advice to match it (owner decision,
  // issue #1428).
  if (!row.isBuyOrder) {
    const summary = orderRowSummary(row);
    if (summary?.kind === 'undercut') {
      return { kind: 'cheapestRival', price: summary.rivalPrice };
    }
  }

  return { kind: 'badgeAdvice' };
}
