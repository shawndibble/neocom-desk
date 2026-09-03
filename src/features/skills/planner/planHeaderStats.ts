/**
 * Live remap-savings badge for the plan header.
 *
 * Booster-blind only: `placeRemaps`' Booster-aware DP can take seconds of
 * synchronous time when a Booster expires mid-plan (see its docstring, and
 * the piecewise-Boosters work referenced there) — far too slow to run in a
 * `useMemo` on every render. `evaluateOptimizationBadge` therefore never
 * passes Booster context; PlanEditor falls back to the explicit "Optimize
 * remaps" result (Booster-aware, computed on click, not live) while a
 * Booster is active. `toOptimizationBadge` is the shared shape both paths
 * report through, so the header can't render two different structures for
 * the same concept.
 */
import { MAX_SUPPORTED_REMAPS, placeRemaps, type PlaceRemapsOptions } from '@/engine/optimizer';
import type { EngineSkill, PlanStep } from '@/engine/types';

/** Below a minute the remap verdict reads "saves 0m" — treat it as no gain. */
export const MIN_MEANINGFUL_SAVINGS_SECONDS = 60;

export interface OptimizationBadge {
  savingsSeconds: number;
  /** Remap count actually evaluated (<= MAX_SUPPORTED_REMAPS). */
  evaluatedRemapCount: number;
  /** Remap count the plan requested, before capping. */
  requestedRemapCount: number;
  /** True when the request exceeded what was evaluated. */
  capped: boolean;
}

export function toOptimizationBadge(
  savingsSeconds: number,
  evaluatedRemapCount: number,
  requestedRemapCount: number
): OptimizationBadge {
  return {
    savingsSeconds,
    evaluatedRemapCount,
    requestedRemapCount,
    capped: requestedRemapCount > evaluatedRemapCount,
  };
}

export function evaluateOptimizationBadge(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: Pick<PlaceRemapsOptions, 'remapCount' | 'currentAttributes' | 'implants'>
): OptimizationBadge | null {
  if (steps.length === 0) return null;
  // No remaps to spend means none to place, so there is no savings figure to
  // report and `placeRemaps` would only hand back its no-remap result
  // anyway. A "None" chip here reads as "remapping cannot help this plan" —
  // a verdict the run never reached, and the opposite of what the editor's
  // own result panel now says (see optimizeVerdict.ts). Show nothing, as for
  // a plan with no entries. This is the rule; PlanEditor's Booster branch
  // builds its badge without coming through here and repeats the check.
  if (options.remapCount <= 0) return null;
  const evaluatedRemapCount = Math.min(options.remapCount, MAX_SUPPORTED_REMAPS);
  const result = placeRemaps(steps, skills, { ...options, remapCount: evaluatedRemapCount });
  return toOptimizationBadge(result.savingsSeconds, evaluatedRemapCount, options.remapCount);
}
