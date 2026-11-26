import { computeSkillGaps, fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { loadRequirementsForTypes } from './skillRequirements';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';

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

export function useCompareCanFly(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<boolean> {
  return useCompareAsync(fittings, profile, computeOne);
}
