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
  | { kind: 'turnIn' }
  | { kind: 'badgeAdvice' };

export function orderDoThis(
  row: OrderAdviceInput,
  { verdict, summary }: Pick<OrderAdvice, 'verdict' | 'summary'> = adviseOrder(row)
): OrderDoThis {
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
    case 'turnInPays':
      return { kind: 'turnIn' };
    default:
      return { kind: 'leaveItAlone' };
  }
}

export interface RowFixCall {
  advice: OrderAdvice;
  call: OrderDoThis;
}

const fixCalls = new WeakMap<OpenOrderRow, RowFixCall>();

export function rowFixCall(row: OpenOrderRow): RowFixCall {
  let entry = fixCalls.get(row);
  if (!entry) {
    const advice = adviseOrder(row);
    entry = { advice, call: orderDoThis(row, advice) };
    fixCalls.set(row, entry);
  }
  return entry;
}

export function doThisPrice(call: OrderDoThis): number | null {
  return call.kind === 'raisePrice' || call.kind === 'undercutTo' || call.kind === 'bid'
    ? call.price
    : null;
}

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
