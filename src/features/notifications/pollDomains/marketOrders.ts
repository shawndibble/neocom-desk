import { orderExpiry } from '@/engine/market/orderHealth';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
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

/* Market orders -------------------------------------------------------------- */

/**
 * Deliberately strict about the buy/sell and item fields, so a baseline
 * written before they existed fails validation rather than being read with
 * them missing. `pollerState.ts` parses a state it does not recognise as
 * `null`, and `diffMarketOrderFilled` fires nothing without a baseline — so
 * the upgrade costs one quiet poll and then a fresh, complete snapshot. The
 * tolerant alternative (default the missing fields) would have every stored
 * buy order read as a sell order exactly once, which is the notification this
 * change exists to stop.
 */
const isMarketOrderEntrySnapshot = shapeGuard<MarketOrderEntrySnapshot>({
  orderId: is.number,
  filled: is.boolean,
  isBuyOrder: is.boolean,
  typeId: is.number,
  quantity: is.number,
  // Optional, unlike the rest: added for fill-time matching, and a baseline
  // written before them must stay readable rather than reset every Character.
  locationId: is.optional(is.number),
  price: is.optional(is.number),
  issuedMs: is.optional(is.number),
  isCorporation: is.optional(is.boolean),
});

/**
 * Merges open orders with order history into the engine's `filled` shape.
 * ESI's history `state` enum ('cancelled' | 'expired') has no distinct
 * "filled" value, so filled-ness is derived here, at the ESI/engine boundary
 * (ARCHITECTURE.md): an order still open is never filled; an order gone from
 * the open list and present in history is filled once `volume_remain` is 0.
 */
export function deriveMarketOrderEntries(
  openOrders: readonly MarketOrder[],
  history: readonly MarketOrderHistory[]
): MarketOrderEntrySnapshot[] {
  const openIds = new Set(openOrders.map((order) => order.order_id));
  // ESI omits `is_buy_order` entirely on a sell order rather than sending
  // false, so absent has to read as "sell" — the same shape the Market views
  // already assume of this field.
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
  entriesKey: 'entries',
  isEntry: isMarketOrderEntrySnapshot,
  load: async (characterId) => {
    const [openResult, historyResult] = await Promise.all([
      loadOrders(characterId),
      loadOrderHistory(characterId),
    ]);
    if (openResult.needsReauth || openResult.cached === null) return null;
    if (historyResult.needsReauth || historyResult.cached === null) return null;
    // A truncated history page set would misreport a still-open order as
    // filled-and-gone; skip this poll entirely rather than save a partial
    // baseline (same reasoning as the contracts truncation guard above).
    if (historyResult.cached.truncated) return null;
    return deriveMarketOrderEntries(openResult.cached.data, historyResult.cached.data);
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // Best-effort: `loadTypeNames` reads the local SDE snapshot first, falls
  // back to one batched ESI call, and yields "Type #id" rather than throwing.
  // A name we cannot resolve is no reason to hold the notification back.
  names: async (fire) => {
    const names = await loadTypeNames([fire.typeId]).catch(() => new Map<number, string>());
    return { item: names.get(fire.typeId) };
  },
});

/* Market orders: station undercut/outbid ------------------------------------- */

/** What `load()` produces per order, before `toSnapshot` folds in the `armed` anti-flap latch (`buildOrderUndercutEntry`). */
type OrderUndercutRawEntry = Omit<OrderUndercutEntrySnapshot, 'armed'>;

/**
 * Strict about every field, `isMarketOrderEntrySnapshot`'s reason: a stored
 * baseline this domain does not fully recognise is discarded (read as no
 * baseline at all) rather than read partially, which would corrupt the
 * `armed` latch's own carry-forward logic on the very poll meant to rebuild
 * it.
 */
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

/**
 * A new domain rather than widening `marketOrderDomain`: that would discard
 * every device's stored `marketOrderFilled` baseline on upgrade, risking a
 * missed fill reported as newly filled against an empty rebuilt baseline. A
 * separate domain also means this fetch — and its Fuzzwork calls — is
 * skipped entirely (same gate `spExtractionDomain` uses) when the event is
 * off for every Character.
 */
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
    // Structure-parked orders never reach Fuzzwork: it aggregates public
    // NPC-station data only, and the page's own `orderCompetition.ts` already
    // routes those through `loadStructureCompetition` instead — asking
    // Fuzzwork about a structure id would spend a call for an answer it can
    // never have. Station-only detection ships first; these orders are
    // simply absent from the snapshot.
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

    // Fanned out at most ESI_FANOUT_CONCURRENCY stations at a time, same
    // precedent as `loadStationBestPrices`. `getStationPrices` shares the
    // Open Orders page's 15-minute cache, so two polls inside that window
    // cost one Fuzzwork request per station, not two.
    const pricesByStation = new Map<number, Map<number, HubAggregate>>();
    await mapWithConcurrencyLimit(
      [...typeIdsByStation.entries()],
      ESI_FANOUT_CONCURRENCY,
      async ([stationId, typeIds]) => {
        pricesByStation.set(
          stationId,
          await getStationPrices(stationId, [...new Set(typeIds)], Date.now, {
            // Compared with a live order: yesterday's close would read as a false undercut.
            allowStale: false,
          })
        );
      }
    );

    return npcOrders.map((order): OrderUndercutRawEntry => {
      const isBuyOrder = order.is_buy_order === true;
      const aggregate = pricesByStation.get(order.location_id)?.get(order.type_id) ?? null;
      const { state, rivalPrice } = classifyStationUndercut(order.price, isBuyOrder, aggregate);
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
  // The one domain whose snapshot needs the previous baseline to build
  // itself — `buildOrderUndercutEntry` folds in the `armed` anti-flap latch.
  toSnapshot: (entries, nowMs, prevSnapshot) => ({
    entries: entries.map((entry) => buildOrderUndercutEntry(entry, prevSnapshot)),
    nowMs,
  }),
  // Best-effort, `marketOrderDomain`'s own precedent: an unresolved item name
  // is no reason to hold the notification back.
  names: async (fire) => {
    const names = await loadTypeNames([fire.typeId]).catch(() => new Map<number, string>());
    return { item: names.get(fire.typeId) };
  },
});

/* Market orders: lapsing ----------------------------------------------------- */

const isOrderExpiryEntrySnapshot = shapeGuard<OrderExpiryEntrySnapshot>({
  orderId: is.number,
  expiresMs: is.number,
  leadMs: is.number,
});

/**
 * Its own domain rather than a widened `marketOrderDomain`, for
 * `marketOrderUndercutDomain`'s reason (widening discards stored fill
 * baselines). Open orders only — the history-derived `filled` entries have
 * already lapsed or filled — and the Character's own: corp orders are not
 * theirs to relist from here. The expiry is `issued + duration` days.
 */
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
  // The Character's *current* lead time, not the baked one (`contractDomain`'s reason).
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
