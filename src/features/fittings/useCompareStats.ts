/**
 * Stats for every compared Fitting under the pilot's selected Damage
 * Profile, cached per Fitting/profile/Damage Profile by `useCompareAsync` so
 * adding a slot doesn't recompute the ones already shown. Each Fitting is
 * worked out on the set it carries, as it would open (`evaluateFitting`).
 */
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { useDamageProfiles } from './damageProfiles';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';
import { evaluateFitting } from './useFittingEvaluation';

function computeUnder(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile?: unknown
): Promise<FittingStats | null> {
  return evaluateFitting(fitting, profile, damageProfile as DamageProfile);
}

/**
 * Per compare slot: its stats once calculated, or `failed` when the engine couldn't calculate them.
 * Nothing calculates until the stored Damage Profile has been read, so the first numbers never come from the wrong profile.
 */
export function useCompareStats(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<FittingStats> {
  const damageProfiles = useDamageProfiles();
  return useCompareAsync(
    fittings,
    damageProfiles.hydrated ? profile : null,
    computeUnder,
    damageProfiles.selected
  );
}
