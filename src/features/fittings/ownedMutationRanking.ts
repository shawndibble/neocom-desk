import { changeVerdict } from '@/engine/fittings/variationDelta';
import { setModuleMutation } from '@/engine/fittings/mutationEdit';
import type { MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import {
  firstResourceOverage,
  fitsResourceBudget,
  type ResourceBudgetOverage,
} from '@/engine/fittings/skillGaps';
import { swapChanges, type SwapChange } from '@/engine/fittings/swapChanges';
import type { FittingSlotKind, ItemMutation } from '@/engine/fittings/types';
import type { VariantEvaluator } from './evaluationBasis';

export const RANK_CAP = 8;

export interface OwnedItem {
  itemId: number;
  mutation: ItemMutation;
  quality: number | null;
}

export interface OwnedEffect {
  delta: SwapChange[];
  fits: boolean;
  overage: ResourceBudgetOverage | null;
  score: number;
}

export type OwnedSort = 'effect' | 'quality';

export function effectScore(delta: readonly SwapChange[]): number {
  let score = 0;
  for (const { change } of delta) {
    const verdict = changeVerdict(change);
    if (verdict === 'better') score += 1;
    else if (verdict === 'worse') score -= 1;
  }
  return score;
}

export const byQuality = (a: OwnedItem, b: OwnedItem) => (b.quality ?? -1) - (a.quality ?? -1);

export function topByQuality(items: readonly OwnedItem[]): OwnedItem[] {
  return [...items].sort(byQuality).slice(0, RANK_CAP);
}

export async function evaluateOwned({
  variants,
  slot,
  slotIndex,
  items,
  lookup,
  signal,
}: {
  variants: VariantEvaluator;
  slot: FittingSlotKind;
  slotIndex: number;
  items: readonly OwnedItem[];
  lookup: MutaplasmidLookup;
  signal?: AbortSignal;
}): Promise<Map<number, OwnedEffect>> {
  const effects = new Map<number, OwnedEffect>();
  for (const item of items) {
    if (signal?.aborted) break;
    try {
      const candidate = setModuleMutation(variants.fitting, slot, slotIndex, item.mutation, lookup);
      const { before, after } = await variants.compare(candidate, signal);
      const delta = swapChanges(before, after);
      effects.set(item.itemId, {
        delta,
        fits: fitsResourceBudget(after),
        overage: firstResourceOverage(after),
        score: effectScore(delta),
      });
    } catch {}
  }
  return effects;
}

export function sortOwned(
  items: readonly OwnedItem[],
  effects: ReadonlyMap<number, OwnedEffect>,
  sort: OwnedSort
): OwnedItem[] {
  const sorted = [...items].sort(byQuality);
  if (sort === 'quality') return sorted;
  const rank = (item: OwnedItem) => {
    const effect = effects.get(item.itemId);
    return effect === undefined ? -Infinity : effect.fits ? effect.score : effect.score - 1e6;
  };
  return sorted.sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra === rb ? 0 : ra < rb ? 1 : -1;
  });
}
