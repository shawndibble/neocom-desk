/**
 * Whole-Fitting can-fly per compare slot: `true` once every skill the hull
 * and everything fitted to it requires is trained — the same signal
 * `useFittingSkillGaps`' `missing.length === 0` gives for a single open
 * Fitting. Cached per Fitting/profile pair by `useCompareAsync`.
 */
import { computeSkillGaps, fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { loadRequirements } from './skillRequirements';
import { useCompareAsync } from './useCompareAsync';

async function computeOne(fitting: Fitting, profile: PilotProfile): Promise<boolean> {
  const typeIds = fittingRequirementTypeIds(fitting);
  const required = await Promise.all(typeIds.map(loadRequirements));
  const byType = new Map(typeIds.map((id, i) => [id, required[i]]));
  return computeSkillGaps(fitting, byType, profile.skillLevels).missing.length === 0;
}

/** Index-parallel to `fittings`; `null` for an empty slot or while still loading. */
export function useCompareCanFly(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): readonly (boolean | null)[] {
  return useCompareAsync(fittings, profile, computeOne);
}
