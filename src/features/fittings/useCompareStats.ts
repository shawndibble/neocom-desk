/** Stats for every compared Fitting under one Damage Profile, cached per Fitting/profile/Damage Profile by `useCompareAsync` so adding a slot doesn't recompute the ones already shown. */
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { computeFittingStats } from './dogmaFittingEngine';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';

function computeUnder(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile?: unknown
): Promise<FittingStats | null> {
  return computeFittingStats(fitting, profile, undefined, damageProfile as DamageProfile);
}

/**
 * Per compare slot: its stats once calculated, or `failed` when the engine couldn't calculate them.
 * Nothing calculates until `damageProfile` is given, so the first numbers never come from the wrong profile.
 */
export function useCompareStats(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null,
  damageProfile: DamageProfile | null
): CompareAsyncResult<FittingStats> {
  return useCompareAsync(
    fittings,
    damageProfile === null ? null : profile,
    computeUnder,
    damageProfile
  );
}
