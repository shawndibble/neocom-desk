/**
 * Open Orders' work-through mode: the queue of orders that need
 * a fix, where the walk through it stands, the price a Next press copies,
 * and when a row a pilot was sent to comes back "Not changed".
 *
 * Pure and view-free. The queue is never frozen at Start: it is re-formed
 * from the page's filtered rows on every render, so a sort or filter change
 * while running re-forms what is left of it. Only what the pilot did (handled
 * and skipped order ids) is state.
 */
import type { CompetingOrder } from '@/engine/market/undercut';
import { outbidPrice, undercutPrice } from '@/engine/market/priceTick';
import { orderGroupKey, type OpenOrderRow, type OrderGroupKey } from './openOrdersModel';
import { orderUrgency } from './orderUrgency';

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
  /** Set only when Open in EVE was tried and failed: ESI's words, or null when it gave none. */
  openError?: string | null;
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
 * Every order that needs a fix, Needs you first and then Watch (system and
 * region undercuts), each in the order the fix list shows it: the caller
 * hands over rows already sorted the way the table shows them.
 */
export function workThroughQueue(rows: readonly OpenOrderRow[]): OpenOrderRow[] {
  const queued = rows.filter((row) => !OUTSIDE_QUEUE.has(orderGroupKey(row)));
  return [
    ...queued.filter((row) => orderUrgency(row) === 'act'),
    ...queued.filter((row) => orderUrgency(row) !== 'act'),
  ];
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
 * on any Character, are never treated as rivals. Never moves an order the
 * wrong way: one already leading at its station (queued for a cheaper seller
 * elsewhere, or for expiring) keeps its own price.
 */
export function clickTimePrice(
  row: Pick<OpenOrderRow, 'locationId' | 'isBuyOrder' | 'price'>,
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
  if (price === null) return { kind: 'noRival' };
  return {
    kind: 'price',
    price: row.isBuyOrder ? Math.max(price, row.price) : Math.min(price, row.price),
  };
}

/** ESI's cache window on a Character's orders: a body fetched sooner after the press can predate it. */
export const ORDERS_CACHE_MS = 1_200_000;

/**
 * A row the pilot was sent to comes back "Not changed" only from an orders
 * read that must postdate the press — fetched a full ESI cache window after
 * it — and still shows the same price AND the same issued time. An order
 * that is gone was not left alone.
 */
export function isNotChanged(
  handled: Pick<HandledOrder, 'previousPrice' | 'issued' | 'sentAt'>,
  order: { price: number; issued: string } | undefined,
  fetchedAt: number
): boolean {
  if (order === undefined || fetchedAt < handled.sentAt + ORDERS_CACHE_MS) return false;
  return order.price === handled.previousPrice && order.issued === handled.issued;
}

type WorkThroughLoss = { kind: 'loss'; amount: number } | { kind: 'costUnknown' };

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
