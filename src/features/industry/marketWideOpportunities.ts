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
 *
 * The job-fee inputs (adjusted prices, system cost index) are fetched through
 * `loadMarketSnapshot` with an *empty* type-id list rather than a new export
 * off `marketData.ts`'s private cache: an empty list costs `getHubPrices` no
 * request at all, so this reads the already-cached adjusted-price/cost-index
 * response every other caller on this route shares. No build system of its
 * own exists for a market-wide scan, so it reads the hub's own system's
 * index — the same fallback `loadMarketSnapshot` already documents for a
 * caller with no plan (LP store, planetary plans).
 */
import { getHubPrices } from '@/market/prices';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { TradeHub } from '@/market/hubs';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { MarketWideTreeMap } from '@/sde/types';
import {
  blueprintSource,
  type BlueprintSource,
  type BlueprintSourceSets,
} from '@/engine/industry/blueprintObtainability';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadMarketSnapshot } from './marketData';
import {
  computeMarketWideRows,
  selectLiquidCandidates,
  type LiquidityCandidate,
  type MarketWideCandidate,
  type MarketWideFeeInputs,
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

/** Whether the pilot's filters keep a product, given how its blueprint is obtained. */
export type MarketWideInclude = (productTypeID: number, source: BlueprintSource) => boolean;

export interface MarketWideScanOptions {
  liquidityFloorIsk?: number;
  topNPerMarketGroup?: number;
  /**
   * The pilot's filters (tier, category, blueprint source). Applied with the
   * blueprint gate, before the top-N cut, so a filtered-out product never
   * takes a slot one the pilot asked for would have filled. A promise so its
   * data loads alongside the product-price fetch.
   */
  include?: Promise<MarketWideInclude>;
}

export interface MarketWideResultRow extends MarketWideRow {
  productName: string;
  /** The blueprint that builds this product, for skill-gate lookups against the catalog. */
  blueprintTypeID: number;
  /** How the pilot gets that blueprint — every row has one; a product with none is never ranked. */
  blueprintSource: BlueprintSource;
}

/** Every product typeID `marketWideTrees.json` carries a tree for. */
export function marketWideProductTypeIds(trees: MarketWideTreeMap): number[] {
  return Object.keys(trees).map(Number);
}

/**
 * Runs the whole opt-in scan: liquidity pass over every candidate whose
 * blueprint the pilot owns or can buy, then a material-price pass over only
 * the survivors, then ranking. Returns an empty list — never a throw — when
 * nothing clears the liquidity floor; the caller reads that as "show the
 * empty state", not an error.
 *
 * `sources` is a promise so the caller can start loading it alongside the
 * product-price fetch rather than ahead of it. The blueprint filter runs
 * before the top-N-per-Market-Group cut, so an unobtainable product never
 * takes a slot an obtainable one would have filled.
 */
export async function runMarketWideScan(
  hub: TradeHub,
  trees: MarketWideTreeMap,
  catalog: BlueprintCatalog,
  modifiers: CharacterModifiers,
  sources: Promise<BlueprintSourceSets>,
  options: MarketWideScanOptions = {},
  /** The character's standing toward `hub`'s NPC owner (issue #1238). Absent/0 = standings assumed 0. */
  standing?: ResolvedStandings
): Promise<MarketWideResultRow[]> {
  const floorIsk = options.liquidityFloorIsk ?? DEFAULT_LIQUIDITY_FLOOR_ISK;
  const topN = options.topNPerMarketGroup ?? DEFAULT_TOP_N_PER_MARKET_GROUP;

  const productTypeIds = marketWideProductTypeIds(trees);
  if (productTypeIds.length === 0) return [];

  const [productAggregates, sourceSets, include] = await Promise.all([
    getHubPrices(hub, productTypeIds),
    sources,
    options.include,
  ]);
  const sourceByProduct = new Map<number, BlueprintSource>();
  for (const productTypeID of productTypeIds) {
    const source = blueprintSource(trees[String(productTypeID)]!.blueprintTypeID, sourceSets);
    if (source && (!include || include(productTypeID, source))) {
      sourceByProduct.set(productTypeID, source);
    }
  }
  const obtainable = productTypeIds.filter((productTypeID) => sourceByProduct.has(productTypeID));
  const liquidityCandidates: LiquidityCandidate[] = obtainable.map((productTypeID) => {
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

  // Independent of phase 2's material-price fetch below — kicked off
  // alongside it rather than after, so the two round trips overlap. Started
  // only once something has actually cleared liquidity, so a scan that ends
  // here doesn't spend it for nothing.
  const feeInputs = loadMarketSnapshot(hub, [], hub.systemId, 'manufacturing');

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
  const marketWideCandidates: MarketWideCandidate[] = liquid.map((candidate) => {
    const tree = trees[String(candidate.productTypeID)]!;
    return {
      productTypeID: candidate.productTypeID,
      tree,
      sellPrice: candidate.sellPrice!,
      sellDepthIsk: candidate.sellPrice! * candidate.sellVolume!,
      blueprintSkills: catalog.byBlueprintTypeID.get(tree.blueprintTypeID)?.blueprint.skills,
    };
  });

  // Same dead-ESI fallback as `computeOpportunityRow`: degrade the job-fee
  // term toward 0 rather than drop every row.
  const snapshot = await feeInputs;
  const feeContext: MarketWideFeeInputs = {
    adjustedPrices: snapshot.adjustedPrices ?? {},
    systemCostIndex: snapshot.systemCostIndex ?? 0,
    modifiers,
    standing,
  };

  const rows = computeMarketWideRows(marketWideCandidates, materialPrices, feeContext);
  return rows.map((row) => ({
    ...row,
    productName: catalog.typesById[String(row.productTypeID)]?.name ?? `#${row.productTypeID}`,
    blueprintTypeID: trees[String(row.productTypeID)]!.blueprintTypeID,
    blueprintSource: sourceByProduct.get(row.productTypeID)!,
  }));
}
