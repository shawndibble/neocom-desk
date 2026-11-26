import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { NO_SP_SUMMARY, rememberSpSummary, type CharacterSpSummary } from '@/stores/characterSp';

const SKILLS_SCOPE = ESI_REGISTRY.getCharacterSkills.scope;

export async function loadCharacterSpSummary(
  characterId: number,
  nowMs: number
): Promise<CharacterSpSummary> {
  const token = await db.tokens.get(characterId);
  if (!(token?.scopes ?? []).includes(SKILLS_SCOPE)) return NO_SP_SUMMARY;

  const { skillsResult, totalSp } = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  return rememberSpSummary(characterId, {
    totalSp,
    unallocatedSp: skillsResult?.data.unallocated_sp ?? null,
  });
}
