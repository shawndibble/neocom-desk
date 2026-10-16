/**
 * A type's required skills (dogma attributes), cached by typeId — shared by
 * `useFittingSkillGaps` (single open Fitting) and `useCompareCanFly` (up to
 * three compared Fittings), so a type looked up by either isn't re-fetched
 * by the other.
 */
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { loadUniverseType } from '@/features/skills/data';
import { extractRequiredSkills } from '@/features/skills/dogma';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

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

export interface TypeRequirements {
  /** Requirements of every type that could be read (cache or ESI). */
  byType: Map<number, readonly RequiredSkill[]>;
  /**
   * Types that could be neither read from cache nor fetched. They are NOT
   * "no requirements": a type that might need anything must never read as
   * flyable, so callers surface this as "unknown".
   */
  unknownTypeIds: number[];
}

/**
 * Requirements for a set of types, bounded to the app's ESI fan-out cap (ESI
 * has no batch endpoint for dogma attributes). A type that cannot be read is
 * reported in `unknownTypeIds` and left out of `byType`, so the rest of the
 * Fitting's gaps still compute without a missing type passing for "none".
 */
export async function loadRequirementsForTypes(
  typeIds: readonly number[]
): Promise<TypeRequirements> {
  const byType = new Map<number, readonly RequiredSkill[]>();
  const unknownTypeIds: number[] = [];
  await mapWithConcurrencyLimit(typeIds, ESI_FANOUT_CONCURRENCY, async (typeId) => {
    const required = await loadKnownRequirements(typeId);
    if (required === null) unknownTypeIds.push(typeId);
    else byType.set(typeId, required);
  });
  return { byType, unknownTypeIds };
}
