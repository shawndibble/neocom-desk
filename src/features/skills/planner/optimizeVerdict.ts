/**
 * Why an Optimize Mode run produced no gain.
 *
 * `placeRemaps` and `optimizeAtMarkers` both answer with a single number,
 * `savingsSeconds`, and both return exactly 0 for two quite different
 * reasons: the optimizer searched and found nothing better, or it was handed
 * nothing to search. The planner used to collapse those into one string
 * ("No meaningful savings" / "No remap improves this plan in its current
 * order — ... Try \"Suggest reorder\""), which tells a user their *plan* is
 * unimprovable when the truth is that the run was a no-op:
 *
 * - Remaps Available (CONTEXT.md) is 0, so `placeRemaps` short-circuits to
 *   the no-remap result before evaluating anything. New plans are seeded
 *   from ESI, which reports 0 for any character with no bonus remaps whose
 *   yearly remap is on cooldown — the common case, not an edge one.
 * - Every Remap Marker still sits at the end of the plan, where "Add remap
 *   marker" puts it. `optimizeAtMarkers` drops the empty segment such a
 *   marker delimits, so nothing is ever remapped.
 *
 * Both are properties of the *input*, which is why they are classified here
 * from the result's own shape rather than re-derived in the view: a run that
 * placed no remapped segment at all did not weigh a remap and reject it.
 *
 * The optimizer's own maths is not implicated in either case — it returns
 * large, correct savings whenever it is given a remap to place and somewhere
 * to place it.
 */
import type { PlaceRemapsResult } from '@/engine/optimizer';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from './planHeaderStats';

export type OptimizeVerdict =
  | { kind: 'saves'; savingsSeconds: number }
  /** The plan's Remaps Available is 0 — nothing to place, so nothing was tried. */
  | { kind: 'noRemapsAvailable' }
  /** Every Remap Marker sits at (or past) the end of the plan, delimiting no steps. */
  | { kind: 'markersAtEnd' }
  /** The optimizer really did evaluate a remap and it does not pay. */
  | { kind: 'noGain' };

function savesVerdict(result: PlaceRemapsResult): OptimizeVerdict | null {
  return result.savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS
    ? { kind: 'saves', savingsSeconds: result.savingsSeconds }
    : null;
}

/**
 * Verdict for "Optimize remaps". `remapCount` is the count actually passed to
 * `placeRemaps` (already capped at MAX_SUPPORTED_REMAPS), checked before the
 * savings so a 0-remap run can never be read as a judgement on the plan.
 */
export function remapVerdict(result: PlaceRemapsResult, remapCount: number): OptimizeVerdict {
  if (remapCount <= 0) return { kind: 'noRemapsAvailable' };
  return savesVerdict(result) ?? { kind: 'noGain' };
}

/**
 * Verdict for "Optimize at my markers". A result carrying no remapped segment
 * means the markers delimited nothing, which is distinct from remapping at
 * them being a poor trade.
 */
export function markerVerdict(result: PlaceRemapsResult): OptimizeVerdict {
  const saves = savesVerdict(result);
  if (saves) return saves;
  return result.segments.some((segment) => segment.remap)
    ? { kind: 'noGain' }
    : { kind: 'markersAtEnd' };
}
