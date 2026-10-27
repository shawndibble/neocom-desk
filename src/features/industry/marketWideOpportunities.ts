/**
 * Market-Wide Build Opportunities (issue #819): the two-phase fetch that
 * turns the whole precomputed `marketWideTrees.json` into a small, priced,
 * ranked list — never a full-SDE sweep of material prices.
 *
 * Phase 1 fetches only product sell prices (cheap: one batched call over
 * every candidate's product typeID) and runs `selectLiquidCandidates` to
 * bound the set by liquidity floor + top-N per Market Group. Phase 2 prices
 * only the survivors, each as the Build Plan a click on its row would create
 * (`priceCandidatesAsPlans`), then ranks them. `getHubPrices` chunks large
 * type-id lists internally, the same batching Build Opportunities' own
 * snapshot fetch relies on.
 */
import { getAdjustedPrices, getHubPrices } from '@/market/prices';
import { reliableSellPrice } from '@/engine/industry/marketWideSanity';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { TradeHub } from '@/market/hubs';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { MarketWideTreeMap } from '@/sde/types';
import {
  blueprintSource,
  type BlueprintSource,
  type BlueprintSourceSets,
} from '@/engine/industry/blueprintObtainability';
import { clampMe, TE_MAX } from '@/engine/industry/efficiency';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BlueprintCatalog } from './blueprintCatalog';
import { findOwnedBlueprint } from './data';
import {
  rankMarketWideRows,
  selectLiquidCandidates,
  type LiquidityCandidate,
  type MarketWideRow,
} from '@/engine/industry/marketWideOpportunities';
import { priceCandidatesAsPlans, type MarketWidePlanCandidate } from './marketWidePlanPricing';

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

/** What decides the ME/TE a row is priced at: the same inputs a plan opened from it starts from. */
export interface MarketWideResearch {
  /** The active Character's owned blueprints — an owned copy's research beats the assumption. */
  owned: readonly CharacterBlueprint[];
  assumedMe: number;
  assumedTe: number;
}

/** The ME/TE a plan for `blueprintTypeID` starts at (`newBuildPlan`'s precedence): owned copy, else assumed. */
export function researchFor(
  blueprintTypeID: number,
  research: MarketWideResearch
): { me: number; te: number } {
  const copy = findOwnedBlueprint(research.owned, blueprintTypeID);
  const te = copy?.time_efficiency ?? research.assumedTe;
  return {
    me: clampMe(copy?.material_efficiency ?? research.assumedMe),
    te: Math.min(Math.max(te, 0), TE_MAX),
  };
}

export interface MarketWideScanOptions {
  /** Prices each row at the ME/TE a plan opened from it would use. Absent: ME/TE 0. */
  research?: MarketWideResearch;
  /** Whose Build Plans the rows are priced as, and whose blueprints `research.owned` are. */
  characterId?: number | null;
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
  /**
   * True when the hub's cheapest sell order was a troll price and the row is
   * priced at CCP's average traded price instead (`reliableSellPrice`).
   */
  priceCapped: boolean;
}

/** A scan row plus ISK/day, which needs the product's traded volume and the share assumption. */
export interface MarketWideDayRow extends MarketWideResultRow {
  /** Null while sales are unread/unknown, or the product doesn't sell. */
  iskPerDay: number | null;
  /** The product's latest price vs its 90-day median in the hub's region, in percent; null when blank, absent while still being read. */
  vs90d?: number | null;
}

/** Every product typeID `marketWideTrees.json` carries a tree for. */
function marketWideProductTypeIds(trees: MarketWideTreeMap): number[] {
  return Object.keys(trees).map(Number);
}

/**
 * Runs the whole opt-in scan: liquidity pass over every candidate whose
 * blueprint the pilot owns, can buy or can invent, then a material-price pass
 * over only the survivors, then ranking. Returns an empty list — never a throw — when
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

  const [productAggregates, sourceSets, include, globalPrices] = await Promise.all([
    getHubPrices(hub, productTypeIds),
    sources,
    options.include,
    // CCP's average traded prices, to catch troll sell orders. Unreachable,
    // the check is skipped rather than failing the scan.
    getAdjustedPrices().catch(() => null),
  ]);
  const sourceByProduct = new Map<number, BlueprintSource>();
  for (const productTypeID of productTypeIds) {
    const source = blueprintSource(trees[String(productTypeID)]!.blueprintTypeID, sourceSets);
    if (source && (!include || include(productTypeID, source))) {
      sourceByProduct.set(productTypeID, source);
    }
  }
  const obtainable = productTypeIds.filter((productTypeID) => sourceByProduct.has(productTypeID));
  // Priced before the liquidity pass, so a troll price inflates neither the
  // revenue nor the sell depth the floor and top-N cut read.
  const capped = new Set<number>();
  const liquidityCandidates: LiquidityCandidate[] = obtainable.map((productTypeID) => {
    const aggregate = productAggregates.get(productTypeID);
    const sellMin = aggregate?.sellMin ?? null;
    let sellPrice = sellMin;
    if (globalPrices) {
      const reliable = reliableSellPrice(sellMin, globalPrices.get(productTypeID)?.average ?? null);
      sellPrice = reliable?.price ?? null;
      if (reliable?.capped) capped.add(productTypeID);
    }
    return {
      productTypeID,
      marketGroupID: trees[String(productTypeID)]!.marketGroupID,
      sellPrice,
      sellVolume: aggregate ? aggregate.sellVolume : null,
    };
  });

  const liquid = selectLiquidCandidates(liquidityCandidates, floorIsk, topN);
  if (liquid.length === 0) return [];

  // Every candidate here already passed the liquidity filter, so `sellPrice`
  // and `sellVolume` are non-null by construction. Each is priced as the
  // Build Plan a click on its row would create (`marketWidePlanPricing.ts`).
  const planCandidates: MarketWidePlanCandidate[] = liquid.map((candidate) => {
    const tree = trees[String(candidate.productTypeID)]!;
    return {
      productTypeID: candidate.productTypeID,
      tree,
      sellPrice: candidate.sellPrice!,
      sellDepthIsk: candidate.sellPrice! * candidate.sellVolume!,
      ...(options.research
        ? researchFor(tree.blueprintTypeID, options.research)
        : { me: 0, te: 0 }),
    };
  });
  const rows = rankMarketWideRows(
    await priceCandidatesAsPlans(planCandidates, {
      hub,
      catalog,
      modifiers,
      standing,
      characterId: options.characterId ?? null,
      research: options.research,
    })
  );
  return rows.map((row) => ({
    ...row,
    productName: catalog.typesById[String(row.productTypeID)]?.name ?? `#${row.productTypeID}`,
    blueprintTypeID: trees[String(row.productTypeID)]!.blueprintTypeID,
    blueprintSource: sourceByProduct.get(row.productTypeID)!,
    priceCapped: capped.has(row.productTypeID),
  }));
}
