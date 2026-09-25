/**
 * A type's required skills (dogma attributes), cached by typeId — shared by
 * `useFittingSkillGaps` (single open Fitting) and `useCompareCanFly` (up to
 * three compared Fittings), so a type looked up by either isn't re-fetched
 * by the other.
 */
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { loadUniverseType } from '@/features/skills/data';
import { extractRequiredSkills } from '@/features/skills/dogma';

const requirementCache = new Map<number, readonly RequiredSkill[]>();

export async function loadRequirements(typeId: number): Promise<readonly RequiredSkill[]> {
  const cached = requirementCache.get(typeId);
  if (cached) return cached;
  const result = await loadUniverseType(typeId);
  // An unfetchable type is left uncached and treated as "no requirements"
  // rather than blocking the rest of the Fitting's gaps.
  if (!result) return [];
  const required = extractRequiredSkills(result.data.dogma_attributes);
  requirementCache.set(typeId, required);
  return required;
}
