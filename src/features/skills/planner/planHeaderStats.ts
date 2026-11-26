import { MAX_SUPPORTED_REMAPS, placeRemaps, type PlaceRemapsOptions } from '@/engine/optimizer';
import type { EngineSkill, PlanStep } from '@/engine/types';

export const MIN_MEANINGFUL_SAVINGS_SECONDS = 60;

export interface OptimizationBadge {
  savingsSeconds: number;
  evaluatedRemapCount: number;
  requestedRemapCount: number;
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
  options: Pick<
    PlaceRemapsOptions,
    'remapCount' | 'currentAttributes' | 'implants' | 'cloneState' | 'timedRemap'
  >
): OptimizationBadge | null {
  if (steps.length === 0) return null;
  if (options.remapCount <= 0) return null;
  const evaluatedRemapCount = Math.min(options.remapCount, MAX_SUPPORTED_REMAPS);
  const result = placeRemaps(steps, skills, { ...options, remapCount: evaluatedRemapCount });
  return toOptimizationBadge(result.savingsSeconds, evaluatedRemapCount, options.remapCount);
}

export function remapSavingsShrank(
  whatIfSavingsSeconds: number | null,
  realSavingsSeconds: number | null
): boolean {
  if (whatIfSavingsSeconds === null || realSavingsSeconds === null) return false;
  return realSavingsSeconds - whatIfSavingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;
}
