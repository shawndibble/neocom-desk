/**
 * Stats for every compared Fitting under the pilot's selected Damage
 * Profile and conditions (Abyssal weather, Overheat all), cached per
 * Fitting/profile/(Damage Profile, conditions) by `useCompareAsync` so
 * adding a slot doesn't recompute the ones already shown. Each Fitting is
 * worked out on the set it carries, as it would open (`evaluateFitting`).
 */
import { useCallback, useMemo, useState } from 'react';
import { useRetryOnReconnect } from '@/lib/useRetryOnReconnect';
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { useStatsConditions, type StatsConditions } from './statsConditions';
import { useDamageProfiles } from './damageProfiles';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';
import { evaluateFitting } from './useFittingEvaluation';

interface Conditions {
  damageProfile: DamageProfile;
  stats: StatsConditions;
  /** Bumped by a retry: a new key, so the failed slots calculate again. */
  attempt: number;
}

function computeUnder(
  fitting: Fitting,
  profile: PilotProfile,
  conditions?: unknown
): Promise<FittingStats | null> {
  const { damageProfile, stats } = conditions as Conditions;
  return evaluateFitting(fitting, profile, damageProfile, stats);
}

/**
 * Per compare slot: its stats once calculated, or `failed` when the engine couldn't calculate them.
 * Nothing calculates until the stored Damage Profile has been read, so the first numbers never come from the wrong profile.
 */
export function useCompareStats(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<FittingStats> & { retry: () => void } {
  const damageProfiles = useDamageProfiles();
  const stats = useStatsConditions();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // One cache key for all three, stable while none changes.
  const conditions = useMemo<Conditions>(
    () => ({ damageProfile: damageProfiles.selected, stats, attempt }),
    [damageProfiles.selected, stats, attempt]
  );
  const result = useCompareAsync(
    fittings,
    damageProfiles.hydrated ? profile : null,
    computeUnder,
    conditions
  );
  // A calculation that failed offline (the ship data never downloaded) mends itself on reconnect.
  const anyFailed = result.failed.some(Boolean);
  useRetryOnReconnect(anyFailed, retry);
  return { ...result, retry };
}
