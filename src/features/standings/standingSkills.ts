import { SKILL_IDS } from '@/engine/industry/types';
import { SOCIAL_SKILL_IDS, type SocialSkillLevels } from '@/engine/standings';
import { loadCorrectedSkills, type CorrectedSkills } from '@/features/skills/correctedSkills';

export interface StandingSkills {
  /** What lifts a standing into the effective one. */
  social: SocialSkillLevels;
  /** What the broker fee reads, with BASE standings. */
  brokerRelationsLevel: number;
}

/**
 * The levels standings need, or `null` when the pilot's skills are unknown:
 * `null` and 0 are different answers, and only a loaded pilot may be shown an
 * untrained rate as theirs. The social skills use the level the pilot can use
 * right now (issue #1236); Broker Relations uses the trained one, as the
 * order fee code does (`useOrderFeeSkills`).
 */
export function standingSkillsFrom(
  corrected: Pick<CorrectedSkills, 'skillsResult' | 'trained' | 'effective'>
): StandingSkills | null {
  if (!corrected.skillsResult) return null;
  return {
    social: {
      connections: corrected.effective.get(SOCIAL_SKILL_IDS.connections) ?? 0,
      criminalConnections: corrected.effective.get(SOCIAL_SKILL_IDS.criminalConnections) ?? 0,
      diplomacy: corrected.effective.get(SOCIAL_SKILL_IDS.diplomacy) ?? 0,
    },
    brokerRelationsLevel: corrected.trained.get(SKILL_IDS.brokerRelations)?.level ?? 0,
  };
}

export async function loadStandingSkills(
  characterId: number,
  nowMs = Date.now()
): Promise<StandingSkills | null> {
  return standingSkillsFrom(
    await loadCorrectedSkills(characterId, nowMs, { skipQueueWithoutScope: true })
  );
}
