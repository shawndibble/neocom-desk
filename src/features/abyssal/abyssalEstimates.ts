/**
 * MutaMarket estimates for a list of owned items, for the figures that value
 * many at once (scope decision `*-abyssal-estimates-in-asset-totals.md`).
 */
import {
  abyssalItemRefs,
  abyssalItemValues,
  type OwnedItem,
} from '@/engine/market/abyssalValuation';
import { readCachedAbyssalEstimates } from '@/market/mutamarket';
import { loadMutaplasmidLookup } from './mutaplasmidData';

/**
 * The last estimate this device holds for each abyssal item among `assets`,
 * however old, and never a network call: what the Net Worth Snapshot counts,
 * so a day's figure doesn't hang on whether the pilot opened Assets lately.
 * Null when the mutaplasmid data won't load (nothing is known to be abyssal).
 */
export async function lastKnownAbyssalValues(
  assets: readonly OwnedItem[]
): Promise<{ isAbyssalType: (typeId: number) => boolean; values: Map<number, number> } | null> {
  const lookup = await loadMutaplasmidLookup().catch(() => null);
  if (!lookup) return null;
  const itemIds = abyssalItemRefs(assets, lookup.isAbyssalType).map((item) => item.itemId);
  const estimates =
    itemIds.length === 0
      ? new Map()
      : await readCachedAbyssalEstimates(itemIds, { includeExpired: true });
  return {
    isAbyssalType: lookup.isAbyssalType,
    values: abyssalItemValues(itemIds, estimates),
  };
}
