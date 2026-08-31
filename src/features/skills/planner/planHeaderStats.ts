/**
 * Plan header stats: the savings badge and projected-finish date surfaced by
 * the Skill Plan header.
 *
 * The badge evaluates at most REMAP_EVALUATION_CAP remaps regardless of what
 * the plan requests — that cap is what the remapCount input itself already
 * enforces (min=0, max=5); a stored value above it can only arrive via
 * imported or synced data written before that limit existed. Reporting
 * savings for a remap count nobody could actually enter would overclaim what
 * the plan can deliver.
 */
import { placeRemaps, type PlaceRemapsOptions } from '@/engine/optimizer';
import type { EngineSkill, PlanStep } from '@/engine/types';

/** Matches the plan editor's remapCount input (min=0, max=5). */
export const REMAP_EVALUATION_CAP = 5;

/** Below a minute the remap verdict reads "saves 0m" — treat it as no gain. */
export const MIN_MEANINGFUL_SAVINGS_SECONDS = 60;

export interface OptimisationBadge {
  savingsSeconds: number;
  /** Remap count actually evaluated (<= REMAP_EVALUATION_CAP). */
  evaluatedRemapCount: number;
  /** Remap count the plan requested, before capping. */
  requestedRemapCount: number;
  /** True when the request exceeded what was evaluated. */
  capped: boolean;
}

export function evaluateOptimisationBadge(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: Pick<PlaceRemapsOptions, 'remapCount' | 'currentAttributes' | 'implants'>
): OptimisationBadge | null {
  if (steps.length === 0) return null;
  const requestedRemapCount = options.remapCount;
  const evaluatedRemapCount = Math.min(Math.max(requestedRemapCount, 0), REMAP_EVALUATION_CAP);
  const result = placeRemaps(steps, skills, { ...options, remapCount: evaluatedRemapCount });
  return {
    savingsSeconds: result.savingsSeconds,
    evaluatedRemapCount,
    requestedRemapCount,
    capped: requestedRemapCount > evaluatedRemapCount,
  };
}

/** Finish date for a plan totalling `totalSeconds` of training, from `now`. Null for an empty plan. */
export function projectedFinish(totalSeconds: number, now: Date): Date | null {
  if (totalSeconds <= 0) return null;
  return new Date(now.getTime() + totalSeconds * 1000);
}
