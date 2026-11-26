import type { CompetingOrder } from '@/engine/market/undercut';
import { outbidPrice, undercutPrice } from '@/engine/market/priceTick';
import { orderGroupKey, type OpenOrderRow, type OrderGroupKey } from './openOrdersModel';
import { orderUrgency } from './orderUrgency';

export interface HandledOrder {
  orderId: number;
  characterId: number;
  previousPrice: number;
  issued: string;
  newPrice: number | null;
  copied: boolean;
  sent: boolean;
  openError?: string | null;
  sentAt: number;
}

export interface WorkThroughState {
  handled: ReadonlyMap<number, HandledOrder>;
  skipped: ReadonlySet<number>;
}

export const EMPTY_WORK_THROUGH: WorkThroughState = { handled: new Map(), skipped: new Set() };

const OUTSIDE_QUEUE: ReadonlySet<OrderGroupKey> = new Set(['healthy', 'notChecked', 'turnInPays']);

export function workThroughQueue(rows: readonly OpenOrderRow[]): OpenOrderRow[] {
  const queued = rows.filter((row) => !OUTSIDE_QUEUE.has(orderGroupKey(row)));
  return [
    ...queued.filter((row) => orderUrgency(row) === 'act'),
    ...queued.filter((row) => orderUrgency(row) !== 'act'),
  ];
}

export interface WorkThroughProgress {
  current: OpenOrderRow | null;
  position: number;
  total: number;
}

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

export const ORDERS_CACHE_MS = 1_200_000;

export function isNotChanged(
  handled: Pick<HandledOrder, 'previousPrice' | 'issued' | 'sentAt'>,
  order: { price: number; issued: string } | undefined,
  fetchedAt: number
): boolean {
  if (order === undefined || fetchedAt < handled.sentAt + ORDERS_CACHE_MS) return false;
  return order.price === handled.previousPrice && order.issued === handled.issued;
}

type WorkThroughLoss = { kind: 'loss'; amount: number } | { kind: 'costUnknown' };

export function workThroughLoss(
  row: Pick<OpenOrderRow, 'isBuyOrder' | 'floor' | 'problem' | 'volumeRemain'>,
  newPrice: number
): WorkThroughLoss | null {
  if (row.isBuyOrder) return null;
  if (row.floor === null) return row.problem === 'belowFloor' ? { kind: 'costUnknown' } : null;
  if (newPrice >= row.floor.relist) return null;
  return { kind: 'loss', amount: (row.floor.relist - newPrice) * row.volumeRemain };
}
