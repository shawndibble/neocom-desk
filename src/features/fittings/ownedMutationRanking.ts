/**
 * Ranks the pilot's owned abyssal modules (the "Load rolls from my assets"
 * list) by what each does to the open Fitting. A candidate is the open Fitting
 * with exactly the edit picking that item makes (`setModuleMutation`), run
 * through the same `VariantEvaluator.compare` the Variations table uses, so a
 * row's figures are the ones the fit shows after the pick.
 *
 * Not a price ranking: it is a choice among modules already owned.
 */
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

/** How many owned items are evaluated; each is a worker compare. The best-rolled come first. */
export const RANK_CAP = 8;

export interface OwnedItem {
  itemId: number;
  mutation: ItemMutation;
  /** Mean roll quality, 0–1; null when the base's values won't load. */
  quality: number | null;
}

/** What fitting one owned item does to the open Fitting. */
export interface OwnedEffect {
  delta: SwapChange[];
  /** Within the CPU, powergrid and calibration budget. */
  fits: boolean;
  overage: ResourceBudgetOverage | null;
  /** Better changes minus worse ones, by each stat's own direction. */
  score: number;
}

export type OwnedSort = 'effect' | 'quality';

/** Better minus worse changes; a change a stat has no direction for counts for nothing. */
export function effectScore(delta: readonly SwapChange[]): number {
  let score = 0;
  for (const { change } of delta) {
    const verdict = changeVerdict(change);
    if (verdict === 'better') score += 1;
    else if (verdict === 'worse') score -= 1;
  }
  return score;
}

/** The owned items worth evaluating: the `RANK_CAP` best-rolled. */
export function topByQuality(items: readonly OwnedItem[]): OwnedItem[] {
  return [...items].sort(byQuality).slice(0, RANK_CAP);
}

const byQuality = (a: OwnedItem, b: OwnedItem) => (b.quality ?? -1) - (a.quality ?? -1);

/**
 * Each of `items` fitted into the slot, one worker compare at a time. An item
 * whose compare throws is left out, so its row simply has no figures.
 */
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
    } catch {
      // This item stays unevaluated; the others still rank.
    }
  }
  return effects;
}

/**
 * Display order. `effect`: items that fit the budget first, then by score,
 * then by quality; items with no figures (past the cap, or failed) follow by quality.
 */
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
  // `sort` is stable, so equal ranks keep the quality order.
  return sorted.sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra === rb ? 0 : ra < rb ? 1 : -1;
  });
}
