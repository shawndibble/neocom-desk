import { orderRowSummary, type OrderAdviceInput, type OrderRowSummary } from './orderRowSummary';
import { roundPriceUp } from '@/engine/market/priceTick';

export type OrderVerdictKind = 'letGo' | 'matchThem' | 'raisePrice' | 'leaveItAlone';

export interface OrderVerdict {
  kind: OrderVerdictKind;
  amount: number | null;
  price: number | null;
}

export function orderVerdict(
  row: OrderAdviceInput,
  summary: OrderRowSummary | null = orderRowSummary(row)
): OrderVerdict | null {
  if (row.isBuyOrder || !row.floor) return null;

  if (row.problem === 'belowFloor') {
    return {
      kind: 'raisePrice',
      amount: row.floor.relist - row.price,
      price: roundPriceUp(row.floor.relist),
    };
  }

  if (summary?.kind === 'undercut' && summary.match) {
    return summary.match.kind === 'loss'
      ? { kind: 'letGo', amount: summary.match.amount, price: summary.suggestedPrice }
      : { kind: 'matchThem', amount: summary.match.amount, price: summary.suggestedPrice };
  }

  if (row.problem === 'healthy') return { kind: 'leaveItAlone', amount: null, price: null };

  return null;
}
