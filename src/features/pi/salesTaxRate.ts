import { SKILL_IDS } from '@/engine/industry/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

export async function loadAccountingLevel(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.trained.get(SKILL_IDS.accounting)?.level ?? 0;
}
