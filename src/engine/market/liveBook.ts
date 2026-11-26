import type { AppraisalBuyWalk, AppraisalItem } from '@/engine/market/appraisal';
import type { HubOrder } from '@/engine/market/haulingMarket';
import {
  buyOrderReaches,
  walkSellIntoBuys,
  type ReachableBuyOrder,
  type SellingStation,
} from '@/engine/market/buyReach';

export interface LiveOrder {
  order_id: number;
  is_buy_order: boolean;
  location_id: number;
  price: number;
  system_id?: number;
  range?: string;
  min_volume?: number;
  volume_remain?: number;
}

export function reachableBuyOrders(
  orders: readonly LiveOrder[],
  station: SellingStation,
  jumps: ReadonlyMap<number, number> | undefined
): ReachableBuyOrder[] {
  const reaching: ReachableBuyOrder[] = [];
  for (const order of orders) {
    if (!order.is_buy_order || !Number.isFinite(order.price) || order.price <= 0) continue;
    const candidate: ReachableBuyOrder = {
      price: order.price,
      volumeRemain: order.volume_remain ?? 0,
      minVolume: order.min_volume,
      range: order.range,
      locationId: order.location_id,
      systemId: order.system_id ?? 0,
    };
    if (buyOrderReaches(candidate, station, jumps)) reaching.push(candidate);
  }
  return reaching;
}

export function liveHubOrders(orders: readonly LiveOrder[]): HubOrder[] {
  return orders.map((o) => ({
    price: o.price,
    volume_remain: o.volume_remain ?? 0,
    is_buy_order: o.is_buy_order,
    location_id: o.location_id,
  }));
}

export interface BuyReach {
  systemId: number;
  jumps: ReadonlyMap<number, number> | undefined;
  units: number;
}

export interface LiveBookPrices {
  sell: number | null;
  buy: number | null;
  sellIsOwn: boolean;
  buyWalk?: AppraisalBuyWalk;
}

export type LiveBookLookup = LiveBookPrices | 'failed' | undefined;

export function liveStationBook(
  orders: readonly LiveOrder[],
  stationId: number,
  ownOrderIds: ReadonlySet<number>,
  reach?: BuyReach
): LiveBookPrices {
  let sell: number | null = null;
  let buy: number | null = null;
  let ownSell: number | null = null;
  const reaching: ReachableBuyOrder[] = [];
  const station = { locationId: stationId, systemId: reach?.systemId ?? 0 };
  for (const order of orders) {
    if (!Number.isFinite(order.price) || order.price <= 0) continue;
    if (order.is_buy_order) {
      if (reach === undefined) {
        if (order.location_id === stationId)
          buy = buy === null ? order.price : Math.max(buy, order.price);
        continue;
      }
      const candidate: ReachableBuyOrder = {
        price: order.price,
        volumeRemain: order.volume_remain ?? 0,
        minVolume: order.min_volume,
        range: order.range,
        locationId: order.location_id,
        systemId: order.system_id ?? 0,
      };
      if (buyOrderReaches(candidate, station, reach.jumps)) reaching.push(candidate);
      continue;
    }
    if (order.location_id !== stationId) continue;
    sell = sell === null ? order.price : Math.min(sell, order.price);
    if (ownOrderIds.has(order.order_id)) {
      ownSell = ownSell === null ? order.price : Math.min(ownSell, order.price);
    }
  }
  const sellIsOwn = sell !== null && ownSell !== null && ownSell <= sell;
  if (reach === undefined) return { sell, buy, sellIsOwn };
  const walk = walkSellIntoBuys(reaching, reach.units);
  return {
    sell,
    buy: walk.average,
    sellIsOwn,
    ...(walk.topBid !== null && (walk.movedPrice || walk.unsold > 0)
      ? {
          buyWalk: {
            topBid: walk.topBid,
            topBidTakes: walk.topBidTakes,
            filled: walk.filled,
            unsold: walk.unsold,
            movedPrice: walk.movedPrice,
          },
        }
      : {}),
  };
}

export function applyLiveBooks(
  items: readonly AppraisalItem[],
  lookup: (typeId: number, quantity: number) => LiveBookLookup
): AppraisalItem[] {
  return items.map((item) => {
    const book = lookup(item.typeId, item.quantity);
    if (book === undefined) return { ...item, priceState: 'cached' };
    if (book === 'failed') return { ...item, priceState: 'failed' };
    return {
      ...item,
      buy: book.buy,
      sell: book.sell,
      sellIsOwn: book.sellIsOwn,
      buyWalk: book.buyWalk,
      priceState: 'live',
    };
  });
}
