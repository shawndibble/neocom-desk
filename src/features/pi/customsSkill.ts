import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { CUSTOMS_CODE_EXPERTISE_SKILL_ID } from './customsRate';

export async function loadCustomsCodeExpertise(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.effective.get(CUSTOMS_CODE_EXPERTISE_SKILL_ID) ?? 0;
}
