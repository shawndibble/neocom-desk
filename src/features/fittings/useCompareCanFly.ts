/**
 * Whole-Fitting can-fly per compare slot: `true` once every skill the hull
 * and everything fitted to it requires is trained — the same signal
 * `useFittingSkillGaps`' `missing.length === 0` gives for a single open
 * Fitting. Cached per Fitting/profile pair by `useCompareAsync`.
 */
import { computeSkillGaps, fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { loadRequirementsForTypes } from './skillRequirements';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';

/**
 * Whether a pilot with these trained skills can fly the whole Fitting.
 * `null` when a fitted type's requirements can't be determined and no
 * confirmed gap already settles it: unknown is not "can fly" (the compare
 * hook shows `null` as failed).
 */
export async function fittingCanFly(
  fitting: Fitting,
  skillLevels: PilotProfile['skillLevels']
): Promise<boolean | null> {
  const typeIds = fittingRequirementTypeIds(fitting);
  const { byType, unknownTypeIds } = await loadRequirementsForTypes(typeIds);
  if (computeSkillGaps(fitting, byType, skillLevels).missing.length > 0) return false;
  if (unknownTypeIds.length > 0) return null;
  return true;
}

function computeOne(fitting: Fitting, profile: PilotProfile): Promise<boolean | null> {
  return fittingCanFly(fitting, profile.skillLevels);
}

/** Per compare slot: whether the Character can fly it, or `failed` when its skill requirements couldn't be loaded. */
export function useCompareCanFly(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<boolean> {
  return useCompareAsync(fittings, profile, computeOne);
}
