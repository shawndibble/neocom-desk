import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

export const INTERPLANETARY_CONSOLIDATION_SKILL_ID = 2495;

export { PLANET_SLOTS_MAX, planetSlots, type PlanetSlots } from './planetSlotsModel';

export async function loadInterplanetaryConsolidation(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.effective.get(INTERPLANETARY_CONSOLIDATION_SKILL_ID) ?? 0;
}
