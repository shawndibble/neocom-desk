import { hubLadders, type HubOrder } from '@/engine/market/haulingMarket';
import type { HubPrices, MaterialCostLine, MaterialPriceBasis, MaterialSourcingMap } from './types';

const DEPTH_WALK_SHARE = 0.01;

export interface DepthLevel {
  price: number;
  units: number;
  listed: number;
}

export interface DepthPrice {
  best: number;
  avg: number;
  need: number;
  filled: number;
  listed: number;
  covered: boolean;
  levels: DepthLevel[];
}

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

export interface DepthNeedSource {
  hubId: string;
  lines: readonly MaterialCostLine[];
  sellVolumes: HubPrices;
  sourcing: MaterialSourcingMap | undefined;
  basis: MaterialPriceBasis | undefined;
}

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
    if (!listed || listed <= 0) continue;
    if (need >= DEPTH_WALK_SHARE * listed) kept.set(typeID, need);
  }
  return kept;
}

export function depthCandidates(
  lines: readonly MaterialCostLine[],
  sellVolumes: HubPrices,
  sourcing: MaterialSourcingMap | undefined,
  basis: MaterialPriceBasis | undefined
): Map<number, number> {
  return overThreshold(buyNeeds({ lines, sourcing, basis }), sellVolumes);
}

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

export function depthPriceMap(depth: ReadonlyMap<number, DepthPrice>): HubPrices {
  const prices: HubPrices = {};
  for (const [typeID, walk] of depth) prices[typeID] = walk.avg;
  return prices;
}
