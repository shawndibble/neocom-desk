import { orderExpiry } from '@/engine/market/orderHealth';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import { loadAllCharactersOpenOrders } from '@/features/market/openOrdersData';
import { ownSlotKey } from '@/features/market/openOrdersModel';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import { classifyStationUndercut } from '@/engine/market/stationUndercutState';
import { getStationPrices, type HubAggregate } from '@/market/prices';
import { loadTypeNames } from '@/features/character/typeNames';
import { projectOrdersLapsing } from '@/engine/projection';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';
import {
  buildOrderUndercutEntry,
  type MarketOrderEntrySnapshot,
  type MarketOrderNotificationFire,
  type MarketOrderSnapshot,
  type MarketOrderUndercutFire,
  type OrderExpiryEntrySnapshot,
  type OrderExpirySnapshot,
  type OrderUndercutEntrySnapshot,
  type OrderUndercutSnapshot,
  type OrdersLapsingFire,
} from '@/engine/notificationDiffs';
import type { ItemNames } from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS, currentThresholds } from './shared';

const isMarketOrderEntrySnapshot = shapeGuard<MarketOrderEntrySnapshot>({
  orderId: is.number,
  filled: is.boolean,
  isBuyOrder: is.boolean,
  typeId: is.number,
  quantity: is.number,
  locationId: is.optional(is.number),
  price: is.optional(is.number),
  issuedMs: is.optional(is.number),
  isCorporation: is.optional(is.boolean),
});

export function deriveMarketOrderEntries(
  openOrders: readonly MarketOrder[],
  history: readonly MarketOrderHistory[]
): MarketOrderEntrySnapshot[] {
  const openIds = new Set(openOrders.map((order) => order.order_id));
  const common = (order: MarketOrder) => {
    const issuedMs = Date.parse(order.issued);
    return {
      orderId: order.order_id,
      isBuyOrder: order.is_buy_order === true,
      typeId: order.type_id,
      quantity: order.volume_total,
      locationId: order.location_id,
      price: order.price,
      ...(Number.isFinite(issuedMs) ? { issuedMs } : {}),
      isCorporation: order.is_corporation === true,
    };
  };
  const entries: MarketOrderEntrySnapshot[] = openOrders.map((order) => ({
    ...common(order),
    filled: false,
  }));
  for (const order of history) {
    if (openIds.has(order.order_id)) continue;
    entries.push({ ...common(order), filled: order.volume_remain === 0 });
  }
  return entries;
}

export const marketOrderDomain = defineDomain<
  MarketOrderEntrySnapshot,
  MarketOrderSnapshot,
  MarketOrderNotificationFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.marketOrders,
  stateKey: 'notifications.pollerState.marketOrders',
  slow: true,
  entriesKey: 'entries',
  isEntry: isMarketOrderEntrySnapshot,
  load: async (characterId) => {
    const [openResult, historyResult] = await Promise.all([
      loadOrders(characterId),
      loadOrderHistory(characterId),
    ]);
    if (openResult.needsReauth || openResult.cached === null) return null;
    if (historyResult.needsReauth || historyResult.cached === null) return null;
    if (historyResult.cached.truncated) return null;
    return deriveMarketOrderEntries(openResult.cached.data, historyResult.cached.data);
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  names: async (fire) => {
    const names = await loadTypeNames([fire.typeId]).catch(() => new Map<number, string>());
    return { item: names.get(fire.typeId) };
  },
});

type OrderUndercutRawEntry = Omit<OrderUndercutEntrySnapshot, 'armed'>;

const isOrderUndercutEntrySnapshot = shapeGuard<OrderUndercutEntrySnapshot>({
  orderId: is.number,
  typeId: is.number,
  isBuyOrder: is.boolean,
  locationId: is.number,
  price: is.number,
  state: is.oneOf(['beaten', 'clear', 'unknown'] as const),
  rivalPrice: is.nullable(is.number),
  armed: is.boolean,
});

export const marketOrderUndercutDomain = defineDomain<
  OrderUndercutRawEntry,
  OrderUndercutSnapshot,
  MarketOrderUndercutFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.marketOrderUndercut,
  stateKey: 'notifications.pollerState.marketOrderUndercut',
  entriesKey: 'entries',
  isEntry: isOrderUndercutEntrySnapshot,
  load: async (characterId) => {
    const result = await loadOrders(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const npcOrders = result.cached.data.filter(
      (order) => order.location_id < UPWELL_STRUCTURE_ID_FLOOR
    );
    if (npcOrders.length === 0) return [];

    const typeIdsByStation = new Map<number, number[]>();
    for (const order of npcOrders) {
      const existing = typeIdsByStation.get(order.location_id);
      if (existing) existing.push(order.type_id);
      else typeIdsByStation.set(order.location_id, [order.type_id]);
    }

    const pricesByStation = new Map<number, Map<number, HubAggregate>>();
    await mapWithConcurrencyLimit(
      [...typeIdsByStation.entries()],
      ESI_FANOUT_CONCURRENCY,
      async ([stationId, typeIds]) => {
        pricesByStation.set(
          stationId,
          await getStationPrices(stationId, [...new Set(typeIds)], Date.now, {
            allowStale: false,
          })
        );
      }
    );

    const ownSnapshot = await loadAllCharactersOpenOrders().catch(() => null);
    const ownPricesBySlot = new Map<string, number[]>();
    for (const entry of ownSnapshot?.entries ?? []) {
      for (const own of entry.orders) {
        const key = ownSlotKey(own.location_id, own.type_id, own.is_buy_order === true);
        const list = ownPricesBySlot.get(key);
        if (list) list.push(own.price);
        else ownPricesBySlot.set(key, [own.price]);
      }
    }

    return npcOrders.map((order): OrderUndercutRawEntry => {
      const isBuyOrder = order.is_buy_order === true;
      const aggregate = pricesByStation.get(order.location_id)?.get(order.type_id) ?? null;
      const { state, rivalPrice } = classifyStationUndercut(
        order.price,
        isBuyOrder,
        aggregate,
        ownPricesBySlot.get(ownSlotKey(order.location_id, order.type_id, isBuyOrder))
      );
      return {
        orderId: order.order_id,
        typeId: order.type_id,
        isBuyOrder,
        locationId: order.location_id,
        price: order.price,
        state,
        rivalPrice,
      };
    });
  },
  toSnapshot: (entries, nowMs, prevSnapshot) => ({
    entries: entries.map((entry) => buildOrderUndercutEntry(entry, prevSnapshot)),
    nowMs,
  }),
  names: async (fire) => {
    const names = await loadTypeNames([fire.typeId]).catch(() => new Map<number, string>());
    return { item: names.get(fire.typeId) };
  },
});

const isOrderExpiryEntrySnapshot = shapeGuard<OrderExpiryEntrySnapshot>({
  orderId: is.number,
  expiresMs: is.number,
  leadMs: is.number,
});

export const orderExpiryDomain = defineDomain<
  OrderExpiryEntrySnapshot,
  OrderExpirySnapshot,
  OrdersLapsingFire
>({
  source: SNAPSHOT_SOURCES.orderExpiry,
  stateKey: 'notifications.pollerState.orderExpiry',
  entriesKey: 'entries',
  isEntry: isOrderExpiryEntrySnapshot,
  load: async (characterId) => {
    const result = await loadOrders(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const leadMs = (await currentThresholds(characterId)).ordersLapsingLeadHours * HOUR_MS;
    const entries: OrderExpiryEntrySnapshot[] = [];
    for (const order of result.cached.data) {
      if (order.is_corporation === true) continue;
      const expiry = orderExpiry(order.issued, order.duration, Date.now());
      if (expiry === null) continue;
      entries.push({ orderId: order.order_id, expiresMs: expiry.expiresAt, leadMs });
    }
    return entries;
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const leadMs = (await currentThresholds(characterId)).ordersLapsingLeadHours * HOUR_MS;
    return projectOrdersLapsing(
      characterId,
      characterName,
      snapshot.entries.map((entry) => ({ ...entry, leadMs })),
      (fire, character, names) =>
        NOTIFICATION_EVENT_ENTRIES.ordersLapsing.projection.push(fire, character, names),
      nowMs
    );
  },
});
