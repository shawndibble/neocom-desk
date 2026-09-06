/**
 * The ways out of one open sell order, priced against its Order Floor —
 * "is there a better exit?" in the detail modal.
 *
 * Every row is a real number this app can stand behind, or it is absent.
 * Two exits the design also asked for are deliberately NOT here:
 * hauling to the nearest trade hub (no hub prices are loaded on this page)
 * and reprocessing into minerals (issue #537 — the refining data does not
 * exist yet). The modal names both as not built rather than estimating them.
 *
 * Which fee applies is the whole point of the comparison, and the two
 * floors differ by exactly that:
 * - HOLDING and DUMPING into a buy order pay sales tax only. The broker fee
 *   on the listing is already sunk, so `floor.fill` is the break-even.
 * - MATCHING is a price edit, which charges the broker fee a second time,
 *   so `floor.relist` is the break-even.
 */
import type { OpenOrderRow } from './openOrdersModel';
import type { CompetingOrder } from '@/engine/market/undercut';

export type OrderExitKind = 'hold' | 'matchStation' | 'dumpToBuyOrder';

export interface OrderExit {
  kind: OrderExitKind;
  /** The price this exit realises a unit. */
  price: number;
  /** ISK a unit after the fees that exit pays. Positive is profit. */
  netPerUnit: number;
}

export interface OrderExitsInput {
  row: OpenOrderRow;
  /** The region order book, once fetched — the only source of buy orders. */
  competitors?: readonly CompetingOrder[];
}

/**
 * The best buy order sitting at the player's OWN station. Region-wide buy
 * orders are excluded on purpose: a buy order carries a range this app does
 * not read, so one elsewhere in the region may not reach the player's stock
 * at all, and an exit that might not exist is worse than no row.
 */
function bestLocalBuyPrice(
  row: OpenOrderRow,
  competitors: readonly CompetingOrder[]
): number | null {
  let best: number | null = null;
  for (const c of competitors) {
    if (!c.isBuyOrder || c.locationId !== row.locationId) continue;
    if (best === null || c.price > best) best = c.price;
  }
  return best;
}

export function orderExits({ row, competitors }: OrderExitsInput): OrderExit[] {
  if (row.isBuyOrder || !row.floor) return [];
  const exits: OrderExit[] = [
    { kind: 'hold', price: row.price, netPerUnit: row.price - row.floor.fill },
  ];

  const rivalPrice = row.deepUndercut?.byScope.station?.price ?? row.station.bestPrice;
  if (rivalPrice !== null && rivalPrice !== undefined && row.station.beatsMe) {
    exits.push({
      kind: 'matchStation',
      price: rivalPrice,
      netPerUnit: rivalPrice - row.floor.relist,
    });
  }

  const buyPrice = competitors ? bestLocalBuyPrice(row, competitors) : null;
  if (buyPrice !== null) {
    exits.push({
      kind: 'dumpToBuyOrder',
      price: buyPrice,
      netPerUnit: buyPrice - row.floor.fill,
    });
  }

  return exits;
}
