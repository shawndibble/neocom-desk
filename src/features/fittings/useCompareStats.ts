/** Stats for every compared Fitting, cached per Fitting/profile pair by `useCompareAsync` so adding a slot doesn't recompute the ones already shown. */
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { computeFittingStats } from './dogmaFittingEngine';
import { useCompareAsync } from './useCompareAsync';

async function computeOne(fitting: Fitting, profile: PilotProfile): Promise<FittingStats | null> {
  try {
    return await computeFittingStats(fitting, profile);
  } catch {
    return null;
  }
}

/** Index-parallel to `fittings`; `null` for a slot that's empty, still loading, or failed to calculate. */
export function useCompareStats(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): readonly (FittingStats | null)[] {
  return useCompareAsync(fittings, profile, computeOne);
}
