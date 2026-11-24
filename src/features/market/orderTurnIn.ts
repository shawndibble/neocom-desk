/**
 * Open Orders' campaign turn-ins (#6708): which orders' Order Detail shows the
 * turn-in, and the one line it adds about the order's own price. Pure.
 */
import { approxIsk } from '@/features/campaigns/turnInContent';
import { formatMarketIsk } from '@/lib/isk';
import type { Translate } from '@/lib/translate';
import type { OpenOrderRow } from './openOrdersModel';

/** A sell order the turn-in beats (whatever its worst problem), or any buy order on a turn-in item. */
export function orderShowsTurnIn(row: Pick<OpenOrderRow, 'isBuyOrder' | 'problems'>): boolean {
  return row.isBuyOrder || row.problems.includes('turnInPays');
}

/**
 * What the turn-in pays over the order's price: "Pays ~2K each over your price
 * (57,990)" for a sell order, "Pays you ~950K per 100 over this bid" for a buy
 * order. Nothing when it pays no more.
 */
export function turnInSurfaceLine(
  t: Translate,
  row: Pick<OpenOrderRow, 'isBuyOrder' | 'price'>,
  turnInEach: number
): string | undefined {
  const gain = turnInEach - row.price;
  if (gain <= 0) return undefined;
  return row.isBuyOrder
    ? t('market.orders.turnIn.overBid', { gain: approxIsk(gain * 100) })
    : t('market.orders.turnIn.overPrice', {
        gain: approxIsk(gain),
        price: formatMarketIsk(row.price),
      });
}
