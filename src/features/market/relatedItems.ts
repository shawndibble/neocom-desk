/**
 * Related Items (CONTEXT.md round 6): the selected item's Market Group
 * siblings, offered below the order book for price comparison. Siblings
 * only — meta/tech variants need a relation the SDE build does not emit yet.
 * Pure and synchronous; the route resolves each sibling's own price.
 */
import type { MarketTypeEntry } from '@/sde/marketTypes';

/** Bounds the strip so a large Market Group cannot grow it unusably long. */
export const RELATED_ITEMS_LIMIT = 20;

export interface RelatedItemsResult {
  /** Siblings to render, capped at RELATED_ITEMS_LIMIT. */
  siblings: readonly MarketTypeEntry[];
  /** True sibling count before the cap. */
  totalCount: number;
  truncated: boolean;
}

export function getRelatedItems(
  typesByGroup: ReadonlyMap<number, readonly MarketTypeEntry[]>,
  selected: MarketTypeEntry
): RelatedItemsResult {
  const groupItems = typesByGroup.get(selected.marketGroupId) ?? [];
  const allSiblings = groupItems.filter((t) => t.typeId !== selected.typeId);
  const truncated = allSiblings.length > RELATED_ITEMS_LIMIT;
  return {
    siblings: truncated ? allSiblings.slice(0, RELATED_ITEMS_LIMIT) : allSiblings,
    totalCount: allSiblings.length,
    truncated,
  };
}
