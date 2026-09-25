/**
 * Stats for every compared Fitting under the pilot's selected Damage
 * Profile and Abyssal weather, cached per Fitting/profile/(Damage Profile,
 * weather) by `useCompareAsync` so
 * adding a slot doesn't recompute the ones already shown. Each Fitting is
 * worked out on the set it carries, as it would open (`evaluateFitting`).
 */
import { useMemo } from 'react';
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { useAbyssalWeather } from './abyssalWeatherSelection';
import { useDamageProfiles } from './damageProfiles';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';
import { evaluateFitting } from './useFittingEvaluation';

interface Conditions {
  damageProfile: DamageProfile;
  weatherTypeId: number | null;
}

function computeUnder(
  fitting: Fitting,
  profile: PilotProfile,
  conditions?: unknown
): Promise<FittingStats | null> {
  const { damageProfile, weatherTypeId } = conditions as Conditions;
  return evaluateFitting(fitting, profile, damageProfile, weatherTypeId);
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
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  // One cache key for both, stable while neither changes.
  const conditions = useMemo<Conditions>(
    () => ({ damageProfile: damageProfiles.selected, weatherTypeId }),
    [damageProfiles.selected, weatherTypeId]
  );
  return useCompareAsync(
    fittings,
    damageProfiles.hydrated ? profile : null,
    computeUnder,
    conditions
  );
}
