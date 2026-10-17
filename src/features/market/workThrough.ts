/**
 * Open Orders' work-through mode (issue #3991): the queue of orders that need
 * a fix, where the walk through it stands, the price a Next press copies,
 * and when a row a pilot was sent to comes back "Not changed".
 *
 * Pure and view-free. The queue is never frozen at Start: it is re-formed
 * from the page's filtered groups on every render, so a sort or filter change
 * while running re-forms what is left of it. Only what the pilot did (handled
 * and skipped order ids) is state.
 */
import type { CompetingOrder } from '@/engine/market/undercut';
import { outbidPrice, undercutPrice } from '@/engine/market/priceTick';
import type { OpenOrderRow, OrderGroup, OrderGroupKey } from './openOrdersModel';

/** What one Next press did for one order. */
export interface HandledOrder {
  orderId: number;
  characterId: number;
  /** The order's price and issued time when Next was pressed — what "Not changed" compares against. */
  previousPrice: number;
  issued: string;
  /** The click-time price, or null when no other order sat at the station. */
  newPrice: number | null;
  /** The price reached the clipboard. */
  copied: boolean;
  /** Open in EVE answered ok. */
  sent: boolean;
  /** When the press happened (ms). Only an orders read fetched after this can say "Not changed". */
  sentAt: number;
}

export interface WorkThroughState {
  handled: ReadonlyMap<number, HandledOrder>;
  skipped: ReadonlySet<number>;
}

export const EMPTY_WORK_THROUGH: WorkThroughState = { handled: new Map(), skipped: new Set() };

const OUTSIDE_QUEUE: ReadonlySet<OrderGroupKey> = new Set(['healthy', 'notChecked']);

/**
 * Every order that needs a fix, in the page's group order (worst first), then
 * the row order each group arrives in — the caller hands over groups already
 * sorted the way their tables show them.
 */
export function workThroughQueue(groups: readonly OrderGroup[]): OpenOrderRow[] {
  return groups.filter((group) => !OUTSIDE_QUEUE.has(group.problem)).flatMap((group) => group.rows);
}

export interface WorkThroughProgress {
  /** The first order in the queue not yet handled or skipped; null once all are. */
  current: OpenOrderRow | null;
  /** 1-based place of `current` (or the count done, once finished). */
  position: number;
  total: number;
}

/**
 * Where the walk stands. Orders already done count toward `position` and
 * `total` even once they leave the queue (a fixed order turns healthy on the
 * next read), so "3 of 12" never slides backwards under the pilot.
 */
export function workThroughProgress(
  queue: readonly OpenOrderRow[],
  state: WorkThroughState
): WorkThroughProgress {
  const done = new Set([...state.handled.keys(), ...state.skipped]);
  const remaining = queue.filter((row) => !done.has(row.orderId));
  const current = remaining[0] ?? null;
  return {
    current,
    position: current === null ? done.size : done.size + 1,
    total: done.size + remaining.length,
  };
}

export type ClickTimePrice = { kind: 'price'; price: number } | { kind: 'noRival' };

/**
 * The one-tick price against the order's own station, from a book read at
 * click time: one tick under the cheapest other seller for a sell order, one
 * tick over the highest other bid for a buy order. The player's own orders,
 * on any Character, are never treated as rivals. This can raise the price as
 * well as lower it — an order already leading is priced up to just under the
 * next seller.
 */
export function clickTimePrice(
  row: Pick<OpenOrderRow, 'locationId' | 'isBuyOrder'>,
  book: readonly Pick<CompetingOrder, 'orderId' | 'price' | 'locationId' | 'isBuyOrder'>[],
  ownOrderIds: ReadonlySet<number>
): ClickTimePrice {
  const rivals = book
    .filter(
      (o) =>
        o.locationId === row.locationId &&
        o.isBuyOrder === row.isBuyOrder &&
        !ownOrderIds.has(o.orderId)
    )
    .map((o) => o.price);
  if (rivals.length === 0) return { kind: 'noRival' };
  const price = row.isBuyOrder
    ? outbidPrice(Math.max(...rivals))
    : undercutPrice(Math.min(...rivals));
  return price === null ? { kind: 'noRival' } : { kind: 'price', price };
}

/**
 * A row the pilot was sent to comes back "Not changed" only from an orders
 * read fetched AFTER the press that still shows the same price AND the same
 * issued time. A read from before the press (the orders endpoint is cached
 * for minutes) proves nothing, and an order that is gone was not left alone.
 */
export function isNotChanged(
  handled: Pick<HandledOrder, 'previousPrice' | 'issued' | 'sentAt'>,
  order: { price: number; issued: string } | undefined,
  fetchedAt: number
): boolean {
  if (order === undefined || fetchedAt <= handled.sentAt) return false;
  return order.price === handled.previousPrice && order.issued === handled.issued;
}

export type WorkThroughLoss = { kind: 'loss'; amount: number } | { kind: 'costUnknown' };

/**
 * What selling the units left at `newPrice` loses against the order's floor.
 * Without a cost basis there is no floor, so a below-floor order says the
 * cost is unknown and never shows a figure.
 */
export function workThroughLoss(
  row: Pick<OpenOrderRow, 'isBuyOrder' | 'floor' | 'problem' | 'volumeRemain'>,
  newPrice: number
): WorkThroughLoss | null {
  if (row.isBuyOrder) return null;
  if (row.floor === null) return row.problem === 'belowFloor' ? { kind: 'costUnknown' } : null;
  if (newPrice >= row.floor.relist) return null;
  return { kind: 'loss', amount: (row.floor.relist - newPrice) * row.volumeRemain };
}
