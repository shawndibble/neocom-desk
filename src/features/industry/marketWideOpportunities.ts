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

export const DEFAULT_LIQUIDITY_FLOOR_ISK = 50_000_000;

export const DEFAULT_TOP_N_PER_MARKET_GROUP = 5;

export type MarketWideInclude = (productTypeID: number, source: BlueprintSource) => boolean;

export interface MarketWideResearch {
  owned: readonly CharacterBlueprint[];
  assumedMe: number;
  assumedTe: number;
}

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
  research?: MarketWideResearch;
  characterId?: number | null;
  liquidityFloorIsk?: number;
  topNPerMarketGroup?: number;
  include?: Promise<MarketWideInclude>;
  pricePercent?: number;
}

export interface MarketWideResultRow extends MarketWideRow {
  productName: string;
  blueprintTypeID: number;
  blueprintSource: BlueprintSource;
  priceCapped: boolean;
}

export interface MarketWideDayRow extends MarketWideResultRow {
  iskPerDay: number | null;
  vs90d?: number | null;
}

function marketWideProductTypeIds(trees: MarketWideTreeMap): number[] {
  return Object.keys(trees).map(Number);
}

export async function runMarketWideScan(
  hub: TradeHub,
  trees: MarketWideTreeMap,
  catalog: BlueprintCatalog,
  modifiers: CharacterModifiers,
  sources: Promise<BlueprintSourceSets>,
  options: MarketWideScanOptions = {},
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
      pricePercent: options.pricePercent,
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
