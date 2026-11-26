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

export function useCompareStats(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<FittingStats> & { retry: () => void } {
  const damageProfiles = useDamageProfiles();
  const stats = useStatsConditions();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
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
  const anyFailed = result.failed.some(Boolean);
  useRetryOnReconnect(anyFailed, retry);
  return { ...result, retry };
}
