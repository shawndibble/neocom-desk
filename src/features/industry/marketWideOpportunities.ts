/**
 * Market-Wide Build Opportunities (issue #819): the two-phase fetch that
 * turns the whole precomputed `marketWideTrees.json` into a small, priced,
 * ranked list — never a full-SDE sweep of material prices.
 *
 * Phase 1 fetches only product sell prices (cheap: one batched call over
 * every candidate's product typeID) and runs `selectLiquidCandidates` to
 * bound the set by liquidity floor + top-N per Market Group. Phase 2 fetches
 * material prices for only the survivors' flattened trees, then
 * `computeMarketWideRows` prices and ranks them. `getHubPrices` chunks large
 * type-id lists internally, the same batching Build Opportunities' own
 * snapshot fetch relies on.
 */
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import type { MarketWideTreeMap } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import {
  computeMarketWideRows,
  selectLiquidCandidates,
  type LiquidityCandidate,
  type MarketWideCandidate,
  type MarketWideRow,
} from '@/engine/industry/marketWideOpportunities';

/**
 * Sell-order ISK a product must carry at the hub to be considered at all
 * (issue #819's own decision doc records why this figure). Chosen to exclude
 * dead-market items without also excluding every T2 module — see
 * docs/context/decisions for the reasoning.
 */
export const DEFAULT_LIQUIDITY_FLOOR_ISK = 50_000_000;

/** How many candidates survive per Market Group category, by sell depth, before material pricing runs at all. */
export const DEFAULT_TOP_N_PER_MARKET_GROUP = 5;

export interface MarketWideScanOptions {
  liquidityFloorIsk?: number;
  topNPerMarketGroup?: number;
}

export interface MarketWideResultRow extends MarketWideRow {
  productName: string;
}

/** Every product typeID `marketWideTrees.json` carries a tree for. */
export function marketWideProductTypeIds(trees: MarketWideTreeMap): number[] {
  return Object.keys(trees).map(Number);
}

/**
 * Runs the whole opt-in scan: liquidity pass over every candidate, then a
 * material-price pass over only the survivors, then ranking. Returns an empty
 * list — never a throw — when nothing clears the liquidity floor; the caller
 * reads that as "show the empty state", not an error.
 */
export async function runMarketWideScan(
  hub: TradeHub,
  trees: MarketWideTreeMap,
  catalog: BlueprintCatalog,
  options: MarketWideScanOptions = {}
): Promise<MarketWideResultRow[]> {
  const floorIsk = options.liquidityFloorIsk ?? DEFAULT_LIQUIDITY_FLOOR_ISK;
  const topN = options.topNPerMarketGroup ?? DEFAULT_TOP_N_PER_MARKET_GROUP;

  const productTypeIds = marketWideProductTypeIds(trees);
  if (productTypeIds.length === 0) return [];

  const productAggregates = await getHubPrices(hub, productTypeIds);
  const liquidityCandidates: LiquidityCandidate[] = productTypeIds.map((productTypeID) => {
    const aggregate = productAggregates.get(productTypeID);
    return {
      productTypeID,
      marketGroupID: trees[String(productTypeID)]!.marketGroupID,
      sellPrice: aggregate?.sellMin ?? null,
      sellVolume: aggregate ? aggregate.sellVolume : null,
    };
  });

  const liquid = selectLiquidCandidates(liquidityCandidates, floorIsk, topN);
  if (liquid.length === 0) return [];

  const materialTypeIds = new Set<number>();
  for (const candidate of liquid) {
    for (const material of trees[String(candidate.productTypeID)]!.materials) {
      materialTypeIds.add(material.typeID);
    }
  }
  const materialAggregates = await getHubPrices(hub, [...materialTypeIds]);
  const materialPrices = new Map<number, number>();
  for (const [typeId, aggregate] of materialAggregates) {
    if (aggregate.sellMin !== null) materialPrices.set(typeId, aggregate.sellMin);
  }

  // Every candidate here already passed the liquidity filter, so `sellPrice`
  // and `sellVolume` are non-null by construction.
  const marketWideCandidates: MarketWideCandidate[] = liquid.map((candidate) => ({
    productTypeID: candidate.productTypeID,
    tree: trees[String(candidate.productTypeID)]!,
    sellPrice: candidate.sellPrice!,
    sellDepthIsk: candidate.sellPrice! * candidate.sellVolume!,
  }));

  const rows = computeMarketWideRows(marketWideCandidates, materialPrices);
  return rows.map((row) => ({
    ...row,
    productName: catalog.typesById[String(row.productTypeID)]?.name ?? `#${row.productTypeID}`,
  }));
}
