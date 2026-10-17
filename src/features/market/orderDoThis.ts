/**
 * The fix list's "Do this" call: one short thing to do about an order, with
 * the exact price to type when there is one.
 *
 * Read off `adviseOrder`, so it never disagrees with the Order Detail modal:
 * a verdict, when the order has a floor to weigh it, wins outright. Without
 * one (no cost basis linked, the common case) a station undercut still names
 * the one-tick-under price the row has always offered to copy, and an
 * outbid buy order the one-tick-over bid.
 */
import { adviseOrder, type OrderAdvice, type OrderAdviceInput } from './orderAdvice';

export type OrderDoThis =
  | { kind: 'raisePrice'; price: number | null }
  | { kind: 'undercutTo'; price: number }
  | { kind: 'bid'; price: number }
  | { kind: 'doNotChase' }
  | { kind: 'relist' }
  | { kind: 'leaveItAlone' }
  | { kind: 'nothingYet' }
  /** A fix-now row with no price in hand: the badge's own action text is the honest answer. */
  | { kind: 'badgeAdvice' };

export function orderDoThis(
  row: OrderAdviceInput,
  { verdict, summary }: Pick<OrderAdvice, 'verdict' | 'summary'> = adviseOrder(row)
): OrderDoThis {
  // Reads healthy only because nothing could check it: no call is honest yet.
  if (row.problem === 'healthy' && row.competitionUnchecked) return { kind: 'nothingYet' };
  if (verdict) {
    switch (verdict.kind) {
      case 'raisePrice':
        return { kind: 'raisePrice', price: verdict.price };
      case 'matchThem':
        if (verdict.price !== null) return { kind: 'undercutTo', price: verdict.price };
        break;
      case 'letGo':
        return { kind: 'doNotChase' };
      case 'leaveItAlone':
        return { kind: 'leaveItAlone' };
    }
  }

  switch (row.problem) {
    case 'belowFloor':
      return { kind: 'raisePrice', price: null };
    case 'undercutStation':
      return summary?.kind === 'undercut' && summary.suggestedPrice !== null
        ? { kind: 'undercutTo', price: summary.suggestedPrice }
        : { kind: 'badgeAdvice' };
    case 'outbid':
      return summary?.kind === 'outbid' && summary.suggestedPrice !== null
        ? { kind: 'bid', price: summary.suggestedPrice }
        : { kind: 'badgeAdvice' };
    case 'expiringOrStale':
      return { kind: 'relist' };
    case 'undercutSystem':
    case 'undercutRegion':
      return { kind: 'leaveItAlone' };
    case 'healthy':
    default:
      return { kind: 'leaveItAlone' };
  }
}

/** The exact price the call names, for "Copy new price" and the work-through. */
export function doThisPrice(call: OrderDoThis): number | null {
  return call.kind === 'raisePrice' || call.kind === 'undercutTo' || call.kind === 'bid'
    ? call.price
    : null;
}
