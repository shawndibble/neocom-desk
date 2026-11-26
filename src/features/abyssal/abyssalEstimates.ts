import {
  abyssalItemRefs,
  abyssalItemValues,
  type OwnedItem,
} from '@/engine/market/abyssalValuation';
import { readCachedAbyssalEstimates } from '@/market/mutamarket';
import { loadMutaplasmidLookup } from './mutaplasmidData';

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
