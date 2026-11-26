import { contractCauseOf } from '../walletCause';
import type { FillMatch } from '../market/fillTime';
import type { StationUndercutState } from '../market/stationUndercutState';
import { HOUR_MS } from '@/lib/age';

export interface OrderExpiryEntrySnapshot {
  orderId: number;
  expiresMs: number;
  leadMs: number;
}

export interface OrderExpirySnapshot {
  entries: readonly OrderExpiryEntrySnapshot[];
  nowMs: number;
}

export interface OrdersLapsingFire {
  eventId: 'ordersLapsing';
  characterId: number;
  count: number;
  soonestMs: number;
  thresholdMs: number;
}

export const ORDER_BATCH_WINDOW_MS = HOUR_MS;

function ordersInWindow(snapshot: OrderExpirySnapshot): OrderExpiryEntrySnapshot[] {
  return snapshot.entries
    .filter((e) => e.expiresMs > snapshot.nowMs && e.expiresMs - snapshot.nowMs <= e.leadMs)
    .sort((a, b) => a.expiresMs - b.expiresMs);
}

export function ordersInBatch(sorted: readonly OrderExpiryEntrySnapshot[]): number {
  if (sorted.length === 0) return 0;
  const limit = sorted[0].expiresMs + ORDER_BATCH_WINDOW_MS;
  return sorted.filter((e) => e.expiresMs <= limit).length;
}

export function diffOrdersLapsing(
  characterId: number,
  prev: OrderExpirySnapshot | undefined,
  next: OrderExpirySnapshot
): OrdersLapsingFire[] {
  if (!prev) return [];
  const inside = ordersInWindow(next);
  if (inside.length === 0) return [];
  const soonestMs = inside[0].expiresMs;
  const before = ordersInWindow(prev);
  if (before.length > 0 && soonestMs - before[0].expiresMs <= ORDER_BATCH_WINDOW_MS) return [];
  return [
    {
      eventId: 'ordersLapsing',
      characterId,
      count: ordersInBatch(inside),
      soonestMs,
      thresholdMs: inside[0].leadMs,
    },
  ];
}

export interface WalletJournalEntrySnapshot {
  id: number;
  amount: number | null;
  thresholdIsk: number;
  dateMs: number;
  refType?: string;
  contextId?: number;
  contextIdType?: string;
}

export interface WalletSnapshot {
  entries: readonly WalletJournalEntrySnapshot[];
  nowMs: number;
}

export interface WalletNotificationFire {
  eventId: 'walletBalanceChanged';
  characterId: number;
  amount: number | null;
  journalEntryId: number;
  dateMs: number;
  refType?: string;
  contextId?: number;
  contextIdType?: string;
  belowThreshold?: true;
}

export function diffWalletBalanceChanged(
  characterId: number,
  prev: WalletSnapshot | undefined,
  next: WalletSnapshot
): WalletNotificationFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.id), 0);
  return next.entries
    .filter((entry) => entry.id > maxPrevId)
    .filter((entry) => entry.amount !== null)
    .filter(
      (entry) =>
        Math.abs(entry.amount ?? 0) >= entry.thresholdIsk || contractCauseOf(entry) !== null
    )
    .sort((a, b) => a.id - b.id)
    .map((entry) => ({
      eventId: 'walletBalanceChanged' as const,
      characterId,
      amount: entry.amount,
      journalEntryId: entry.id,
      dateMs: entry.dateMs,
      ...(Math.abs(entry.amount ?? 0) < entry.thresholdIsk
        ? { belowThreshold: true as const }
        : {}),
      ...(entry.refType !== undefined ? { refType: entry.refType } : {}),
      ...(entry.contextId !== undefined ? { contextId: entry.contextId } : {}),
      ...(entry.contextIdType !== undefined ? { contextIdType: entry.contextIdType } : {}),
    }));
}

export interface MarketOrderEntrySnapshot {
  orderId: number;
  filled: boolean;
  isBuyOrder: boolean;
  typeId: number;
  quantity: number;
  locationId?: number;
  price?: number;
  issuedMs?: number;
  isCorporation?: boolean;
}

export interface MarketOrderSnapshot {
  entries: readonly MarketOrderEntrySnapshot[];
  nowMs: number;
}

export interface MarketOrderNotificationFire {
  eventId: 'marketOrderFilled';
  characterId: number;
  orderId: number;
  typeId: number;
  quantity: number;
  fillMatch?: FillMatch;
}

function fillMatchFor(entry: MarketOrderEntrySnapshot): FillMatch | undefined {
  const { locationId, price, issuedMs } = entry;
  if (entry.isCorporation === true) return undefined;
  if (locationId === undefined || price === undefined || issuedMs === undefined) return undefined;
  return { typeId: entry.typeId, locationId, price, issuedMs, quantity: entry.quantity };
}

export function diffMarketOrderFilled(
  characterId: number,
  prev: MarketOrderSnapshot | undefined,
  next: MarketOrderSnapshot
): MarketOrderNotificationFire[] {
  if (!prev) return [];
  const prevFilledById = new Map(prev.entries.map((entry) => [entry.orderId, entry.filled]));
  const fires: MarketOrderNotificationFire[] = [];
  for (const entry of next.entries) {
    if (!entry.filled || entry.isBuyOrder) continue;
    if (prevFilledById.get(entry.orderId) === true) continue;
    const fillMatch = fillMatchFor(entry);
    fires.push({
      eventId: 'marketOrderFilled',
      characterId,
      orderId: entry.orderId,
      typeId: entry.typeId,
      quantity: entry.quantity,
      ...(fillMatch === undefined ? {} : { fillMatch }),
    });
  }
  return fires;
}

export interface OrderUndercutEntrySnapshot {
  orderId: number;
  typeId: number;
  isBuyOrder: boolean;
  locationId: number;
  price: number;
  state: StationUndercutState;
  rivalPrice: number | null;
  armed: boolean;
}

export interface OrderUndercutSnapshot {
  entries: readonly OrderUndercutEntrySnapshot[];
  nowMs: number;
}

export interface MarketOrderUndercutFire {
  eventId: 'marketOrderUndercut';
  characterId: number;
  orderId: number;
  typeId: number;
  isBuyOrder: boolean;
  price: number;
  rivalPrice: number;
}

function wasArmedBefore(
  prevSnapshot: OrderUndercutSnapshot | undefined,
  prevEntry: OrderUndercutEntrySnapshot | undefined,
  price: number
): boolean {
  if (!prevSnapshot) return false;
  if (!prevEntry) return true;
  if (prevEntry.price !== price) return true;
  return prevEntry.armed;
}

const prevEntryMaps = new WeakMap<OrderUndercutSnapshot, Map<number, OrderUndercutEntrySnapshot>>();

function prevEntryFor(
  prevSnapshot: OrderUndercutSnapshot,
  orderId: number
): OrderUndercutEntrySnapshot | undefined {
  let map = prevEntryMaps.get(prevSnapshot);
  if (!map) {
    map = new Map(prevSnapshot.entries.map((entry) => [entry.orderId, entry]));
    prevEntryMaps.set(prevSnapshot, map);
  }
  return map.get(orderId);
}

export function buildOrderUndercutEntry(
  order: {
    orderId: number;
    typeId: number;
    isBuyOrder: boolean;
    locationId: number;
    price: number;
    state: StationUndercutState;
    rivalPrice: number | null;
  },
  prevSnapshot: OrderUndercutSnapshot | undefined
): OrderUndercutEntrySnapshot {
  const prevEntry = prevSnapshot ? prevEntryFor(prevSnapshot, order.orderId) : undefined;
  const armedBefore = wasArmedBefore(prevSnapshot, prevEntry, order.price);
  const armed = order.state === 'unknown' ? armedBefore : order.state === 'clear';
  return { ...order, armed };
}

export function diffMarketOrderUndercut(
  characterId: number,
  prev: OrderUndercutSnapshot | undefined,
  next: OrderUndercutSnapshot
): MarketOrderUndercutFire[] {
  if (!prev) return [];
  const prevByOrderId = new Map(prev.entries.map((entry) => [entry.orderId, entry]));
  const fires: MarketOrderUndercutFire[] = [];
  for (const entry of next.entries) {
    if (entry.state !== 'beaten' || entry.rivalPrice === null) continue;
    const prevEntry = prevByOrderId.get(entry.orderId);
    if (!wasArmedBefore(prev, prevEntry, entry.price)) continue;
    fires.push({
      eventId: 'marketOrderUndercut',
      characterId,
      orderId: entry.orderId,
      typeId: entry.typeId,
      isBuyOrder: entry.isBuyOrder,
      price: entry.price,
      rivalPrice: entry.rivalPrice,
    });
  }
  return fires;
}

export interface PriceAlertEntrySnapshot {
  typeId: number;
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
  price: number | null;
}

export interface PriceAlertSnapshot {
  entries: readonly PriceAlertEntrySnapshot[];
  nowMs: number;
}

export interface PriceAlertTriggeredFire {
  eventId: 'priceAlertTriggered';
  characterId: number;
  typeId: number;
  name: string;
  price: number;
  targetPrice: number;
  direction: 'above' | 'below';
}

export function priceAlertCrossed(entry: PriceAlertEntrySnapshot): boolean {
  if (entry.price === null) return false;
  return entry.direction === 'above'
    ? entry.price >= entry.targetPrice
    : entry.price <= entry.targetPrice;
}

export function diffPriceAlertTriggered(
  characterId: number,
  prev: PriceAlertSnapshot | undefined,
  next: PriceAlertSnapshot
): PriceAlertTriggeredFire[] {
  if (!prev) return [];
  const prevByType = new Map(prev.entries.map((entry) => [entry.typeId, entry]));
  const fires: PriceAlertTriggeredFire[] = [];
  for (const entry of next.entries) {
    if (entry.price === null) continue;
    if (!priceAlertCrossed(entry)) continue;
    const prevEntry = prevByType.get(entry.typeId);
    const sameTarget =
      prevEntry !== undefined &&
      prevEntry.targetPrice === entry.targetPrice &&
      prevEntry.direction === entry.direction;
    if (sameTarget && priceAlertCrossed(prevEntry)) continue;
    fires.push({
      eventId: 'priceAlertTriggered',
      characterId,
      typeId: entry.typeId,
      name: entry.name,
      price: entry.price,
      targetPrice: entry.targetPrice,
      direction: entry.direction,
    });
  }
  return fires;
}
