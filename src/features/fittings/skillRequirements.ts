import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { extractRequiredSkills } from '@/features/skills/dogma';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

const requirementCache = new Map<number, readonly RequiredSkill[]>();

export async function loadKnownRequirements(
  typeId: number
): Promise<readonly RequiredSkill[] | null> {
  const cached = requirementCache.get(typeId);
  if (cached) return cached;
  const type = await loadTypeDetail(typeId, { retry: true });
  if (!type) return null;
  const required = extractRequiredSkills(type.dogma_attributes);
  requirementCache.set(typeId, required);
  return required;
}

export interface TypeRequirements {
  byType: Map<number, readonly RequiredSkill[]>;
  unknownTypeIds: number[];
}

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
