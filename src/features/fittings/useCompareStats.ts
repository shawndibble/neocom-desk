/** Stats for every compared Fitting, cached per Fitting/profile pair by `useCompareAsync` so adding a slot doesn't recompute the ones already shown. */
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { computeFittingStats } from './dogmaFittingEngine';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';

/** Per compare slot: its stats once calculated, or `failed` when the engine couldn't calculate them. */
export function useCompareStats(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<FittingStats> {
  return useCompareAsync(fittings, profile, computeFittingStats);
}
