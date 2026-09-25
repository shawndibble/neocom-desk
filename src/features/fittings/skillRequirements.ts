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

/** A type's required skills, or null when ESI couldn't supply the type (left uncached, to retry). */
export async function loadKnownRequirements(
  typeId: number
): Promise<readonly RequiredSkill[] | null> {
  const cached = requirementCache.get(typeId);
  if (cached) return cached;
  const result = await loadUniverseType(typeId);
  if (!result) return null;
  const required = extractRequiredSkills(result.data.dogma_attributes);
  requirementCache.set(typeId, required);
  return required;
}

/**
 * A type's required skills, an unfetchable type treated as "no requirements"
 * rather than blocking the rest of the Fitting's gaps.
 */
export async function loadRequirements(typeId: number): Promise<readonly RequiredSkill[]> {
  return (await loadKnownRequirements(typeId)) ?? [];
}
