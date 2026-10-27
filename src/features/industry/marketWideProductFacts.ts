/**
 * Each market-wide scan candidate's tier and category, for the scan's
 * filters: its meta group from `market/variations.json` and its root Market
 * Group from `market/groups.json`. Both are small, lazily loaded market files
 * the scan fetches alongside its prices.
 */
import {
  productCategory,
  productTier,
  type ProductCategory,
  type ProductTier,
} from '@/engine/industry/marketWideFilters';
import { loadMarketGroups, loadVariations } from '@/sde/loadMarketSde';
import type { MarketWideTreeMap } from '@/sde/types';

export interface MarketWideProductFacts {
  tier: ProductTier;
  category: ProductCategory;
}

export async function loadMarketWideProductFacts(
  trees: MarketWideTreeMap
): Promise<ReadonlyMap<number, MarketWideProductFacts>> {
  const [variations, groups] = await Promise.all([loadVariations(), loadMarketGroups()]);
  const parentOf = new Map(groups.map((group) => [group.id, group.parentId]));
  const rootOf = (marketGroupID: number): number => {
    let id = marketGroupID;
    for (let parent = parentOf.get(id); parent != null; parent = parentOf.get(id)) id = parent;
    return id;
  };
  const facts = new Map<number, MarketWideProductFacts>();
  for (const [productTypeID, tree] of Object.entries(trees)) {
    const id = Number(productTypeID);
    facts.set(id, {
      tier: productTier(variations.types[id]?.metaGroupId),
      category: productCategory(tree.marketGroupID === null ? null : rootOf(tree.marketGroupID)),
    });
  }
  return facts;
}
