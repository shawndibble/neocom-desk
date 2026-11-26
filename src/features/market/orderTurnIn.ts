import { approxIsk } from '@/features/campaigns/turnInContent';
import { formatMarketIsk } from '@/lib/isk';
import type { Translate } from '@/lib/translate';
import type { OpenOrderRow } from './openOrdersModel';

const BID_LINE_QUANTITY = 100;

export function orderShowsTurnIn(row: Pick<OpenOrderRow, 'isBuyOrder' | 'problems'>): boolean {
  return row.isBuyOrder || row.problems.includes('turnInPays');
}

export function bidTurnInPays(
  row: Pick<OpenOrderRow, 'isBuyOrder' | 'price' | 'turnInEach'>
): boolean {
  return row.isBuyOrder && row.turnInEach !== undefined && row.turnInEach > row.price;
}

export function orderTurnInGlyph(
  row: Pick<OpenOrderRow, 'isBuyOrder' | 'price' | 'turnInEach' | 'problem' | 'problems'>
): boolean {
  if (row.isBuyOrder) return bidTurnInPays(row);
  return row.problem !== 'turnInPays' && row.problems.includes('turnInPays');
}

export function turnInSurfaceLine(
  t: Translate,
  row: Pick<OpenOrderRow, 'isBuyOrder' | 'price'>,
  turnInEach: number
): string | undefined {
  const gain = turnInEach - row.price;
  if (gain <= 0) return undefined;
  return row.isBuyOrder
    ? t('market.orders.turnIn.overBid', {
        gain: approxIsk(gain * BID_LINE_QUANTITY),
        quantity: BID_LINE_QUANTITY,
      })
    : t('market.orders.turnIn.overPrice', {
        gain: approxIsk(gain),
        price: formatMarketIsk(row.price),
      });
}
