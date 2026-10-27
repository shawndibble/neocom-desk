/**
 * Depth Price: a material bought in bulk priced at what
 * buying that many actually costs at the Trade Hub, walking its sell orders
 * cheapest first, instead of at the lowest sell alone.
 *
 * Only a need that is large against what is listed is walked — at least
 * `DEPTH_WALK_SHARE` of the units the hub's aggregate says are for sale. Below
 * that the cheapest orders cover it and the lowest sell is already right, so
 * no Order Book is fetched for it.
 *
 * Sell basis only: on the buy basis the pilot places their own buy orders,
 * so there is no book to walk. A material the pilot priced themselves is
 * theirs, never walked. The product's revenue is never walked either.
 */
import { hubLadders, type HubOrder } from '@/engine/market/haulingMarket';
import type { HubPrices, MaterialCostLine, MaterialPriceBasis, MaterialSourcingMap } from './types';

/** Need, as a share of the hub's listed units, at which a material's price walks the book. */
const DEPTH_WALK_SHARE = 0.01;

/** One price level the walk bought from. */
export interface DepthLevel {
  price: number;
  /** Units bought at this price. */
  units: number;
  /** Units listed at this price; more than `units` on the level the walk stopped in. */
  listed: number;
}

export interface DepthPrice {
  /** Lowest sell at the station. */
  best: number;
  /** ISK spent over units filled: the unit price the plan costs the material at. */
  avg: number;
  need: number;
  filled: number;
  /** Every unit listed for sale at the station. */
  listed: number;
  /** False when the station lists fewer units than the need. */
  covered: boolean;
  levels: DepthLevel[];
}

/**
 * Buys `need` units through the station's sell orders, cheapest first. A
 * shortfall is priced at the average of everything listed and marked
 * `covered: false`. Null when there is no need or nothing is listed.
 */
export function walkSellBook(
  orders: readonly HubOrder[],
  stationId: number,
  need: number
): DepthPrice | null {
  const quantity = Math.max(0, Math.floor(need));
  const { sell } = hubLadders(orders, stationId);
  if (quantity === 0 || sell.length === 0) return null;
  const levels: DepthLevel[] = [];
  let remaining = quantity;
  let cost = 0;
  for (const level of sell) {
    if (remaining <= 0) break;
    const units = Math.min(level.units, remaining);
    levels.push({ price: level.price, units, listed: level.units });
    cost += units * level.price;
    remaining -= units;
  }
  const filled = quantity - remaining;
  return {
    best: sell[0]!.price,
    avg: cost / filled,
    need: quantity,
    filled,
    listed: sell.reduce((sum, level) => sum + level.units, 0),
    covered: remaining === 0,
    levels,
  };
}

/** One plan's inputs to picking which materials walk the book. */
export interface DepthNeedSource {
  /** Plans are only summed with others at the same hub. */
  hubId: string;
  /** What the plan still has to buy: `shoppingListMaterials`' leaves. */
  lines: readonly MaterialCostLine[];
  /** Units listed for sale at the hub, from its aggregate. */
  sellVolumes: HubPrices;
  sourcing: MaterialSourcingMap | undefined;
  basis: MaterialPriceBasis | undefined;
}

/** Units each type still has to be bought, leaving out what the walk never prices. */
function buyNeeds(source: Omit<DepthNeedSource, 'hubId' | 'sellVolumes'>): Map<number, number> {
  const needs = new Map<number, number>();
  if (source.basis === 'buy') return needs;
  for (const line of source.lines) {
    if (line.remainingQuantity <= 0) continue;
    if (source.sourcing?.[line.typeID]?.overridePrice !== undefined) continue;
    needs.set(line.typeID, (needs.get(line.typeID) ?? 0) + line.remainingQuantity);
  }
  return needs;
}

function overThreshold(needs: Map<number, number>, sellVolumes: HubPrices): Map<number, number> {
  const kept = new Map<number, number>();
  for (const [typeID, need] of needs) {
    const listed = sellVolumes[typeID];
    // Nothing listed: the row is already unpriced; a book walk has nothing to add.
    if (!listed || listed <= 0) continue;
    if (need >= DEPTH_WALK_SHARE * listed) kept.set(typeID, need);
  }
  return kept;
}

/** The materials one plan walks the book for, with how many it needs. */
export function depthCandidates(
  lines: readonly MaterialCostLine[],
  sellVolumes: HubPrices,
  sourcing: MaterialSourcingMap | undefined,
  basis: MaterialPriceBasis | undefined
): Map<number, number> {
  return overThreshold(buyNeeds({ lines, sourcing, basis }), sellVolumes);
}

/**
 * A Build Group's walk: each hub's need summed across members first, then
 * tested against the threshold once per type. Walking each member alone
 * would price every one of them off the same cheapest orders.
 */
export function summedDepthNeeds(
  members: readonly DepthNeedSource[]
): Map<string, Map<number, number>> {
  const byHub = new Map<string, { needs: Map<number, number>; sellVolumes: HubPrices }>();
  for (const member of members) {
    const hub = byHub.get(member.hubId) ?? { needs: new Map(), sellVolumes: member.sellVolumes };
    for (const [typeID, need] of buyNeeds(member)) {
      hub.needs.set(typeID, (hub.needs.get(typeID) ?? 0) + need);
    }
    byHub.set(member.hubId, hub);
  }
  const result = new Map<string, Map<number, number>>();
  for (const [hubId, { needs, sellVolumes }] of byHub) {
    const kept = overThreshold(needs, sellVolumes);
    if (kept.size > 0) result.set(hubId, kept);
  }
  return result;
}

/** The unit prices a resolve layers over the hub's lowest sells. */
export function depthPriceMap(depth: ReadonlyMap<number, DepthPrice>): HubPrices {
  const prices: HubPrices = {};
  for (const [typeID, walk] of depth) prices[typeID] = walk.avg;
  return prices;
}
