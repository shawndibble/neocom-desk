/**
 * The fix list's "Do this" call: one short thing to do about an order, with
 * the exact price to type when there is one. Read off `adviseOrder`, so it
 * never disagrees with the Order Detail: a verdict (needs a floor) wins.
 * Without one (no cost basis, the common case): station undercut → one tick
 * under; outbid buy → one tick over.
 */
import { adviseOrder, type OrderAdvice, type OrderAdviceInput } from './orderAdvice';
import type { OpenOrderRow } from './openOrdersModel';
import type { Translate } from '@/lib/translate';
import { formatMarketIsk } from '@/lib/isk';

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
    default:
      return { kind: 'leaveItAlone' };
  }
}

export interface RowFixCall {
  advice: OrderAdvice;
  call: OrderDoThis;
}

const fixCalls = new WeakMap<OpenOrderRow, RowFixCall>();

/** A row's advice and call, worked out once per row object: its cells, card and menu all read it. */
export function rowFixCall(row: OpenOrderRow): RowFixCall {
  let entry = fixCalls.get(row);
  if (!entry) {
    const advice = adviseOrder(row);
    entry = { advice, call: orderDoThis(row, advice) };
    fixCalls.set(row, entry);
  }
  return entry;
}

/** The exact price the call names, for "Copy new price" and the work-through. */
export function doThisPrice(call: OrderDoThis): number | null {
  return call.kind === 'raisePrice' || call.kind === 'undercutTo' || call.kind === 'bid'
    ? call.price
    : null;
}

/** The row's call in words, as the fix list's "Do this" cell and the export read it; null when a fix-now row has no badge to speak for it. */
export function orderDoThisText(t: Translate, row: OpenOrderRow): string | null {
  const {
    call,
    advice: { badge },
  } = rowFixCall(row);
  switch (call.kind) {
    case 'raisePrice':
      return call.price === null
        ? t('market.orders.fixList.doThis.raisePrice')
        : t('market.orders.fixList.doThis.raisePriceTo', { price: formatMarketIsk(call.price) });
    case 'undercutTo':
    case 'bid':
      return t(`market.orders.fixList.doThis.${call.kind}`, { price: formatMarketIsk(call.price) });
    case 'badgeAdvice':
      return badge ? t(`market.orders.badge.${badge.kind}Action`) : null;
    default:
      return t(`market.orders.fixList.doThis.${call.kind}`);
  }
}
