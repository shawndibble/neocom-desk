/**
 * The one-line call the detail modal opens with: what to actually do about
 * this order.
 *
 * Only ever answerable with an Order Floor. "Let this one go" and "match
 * them" are the same situation told apart by whether the rival's price
 * still clears what the item cost — with no cost basis linked there is no
 * honest way to pick between them, so this returns `null` and the modal
 * falls back to the badge's own generic advice. That is the common case,
 * not the exception: an account that has linked no builds has no floor on
 * any row.
 *
 * Pure, and deliberately separate from `orderBadgeKind` — the badge names
 * the problem and is the same on the row and in the modal; this is a
 * judgement the row has no space for.
 */
import type { OpenOrderRow } from './openOrdersModel';
import { orderRowSummary } from './orderRowSummary';
import { roundPriceUp } from '@/engine/market/priceTick';

export type OrderVerdictKind = 'letGo' | 'matchThem' | 'raisePrice' | 'leaveItAlone';

export interface OrderVerdict {
  kind: OrderVerdictKind;
  /** ISK a unit at stake in the call — the loss from following the rival, or the margin left after undercutting. Null where the verdict carries no single figure. */
  amount: number | null;
  /** The suggested LEGAL price behind this call — one tick under the rival for `matchThem`/`letGo`, the rounded-up floor for `raisePrice`. Null for `leaveItAlone`, which suggests no price at all. */
  price: number | null;
}

export function orderVerdict(row: OpenOrderRow): OrderVerdict | null {
  // A buy order's floor is a sell-side idea; nothing here applies to one.
  if (row.isBuyOrder || !row.floor) return null;

  if (row.problem === 'belowFloor') {
    return {
      kind: 'raisePrice',
      amount: row.floor.relist - row.price,
      price: roundPriceUp(row.floor.relist),
    };
  }

  const summary = orderRowSummary(row);
  if (summary?.kind === 'undercut' && summary.match) {
    return summary.match.kind === 'loss'
      ? { kind: 'letGo', amount: summary.match.amount, price: summary.suggestedPrice }
      : { kind: 'matchThem', amount: summary.match.amount, price: summary.suggestedPrice };
  }

  if (row.problem === 'healthy') return { kind: 'leaveItAlone', amount: null, price: null };

  // Expiring, outbid, or an undercut with no rival price in hand: the badge's
  // own advice is the honest answer, so say nothing here.
  return null;
}
