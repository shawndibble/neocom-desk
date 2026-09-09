/**
 * ESI skill ids -> `engine/industry/jobSlots.ts`'s named `JobSlotSkills` —
 * the ESI/engine boundary adaptation ARCHITECTURE.md asks for, so the engine
 * itself never has to know a skill's numeric type id.
 *
 * Ids verified against EVE Ref (everef.net/types/<id>): Mass Production
 * 3387, Advanced Mass Production 24625, Laboratory Operation 3406, Advanced
 * Laboratory Operation 24624, Mass Reactions 45748, Advanced Mass Reactions
 * 45749.
 */
import type { CharacterSkill } from '@/esi/endpoints';
import type { JobSlotSkills } from '@/engine/industry/jobSlots';

const SKILL_ID = {
  massProduction: 3387,
  advancedMassProduction: 24625,
  laboratoryOperation: 3406,
  advancedLaboratoryOperation: 24624,
  massReactions: 45748,
  advancedMassReactions: 45749,
} as const satisfies Record<keyof JobSlotSkills, number>;

/**
 * `active_skill_level`, not `trained_skill_level`: job slots follow the
 * level actually in effect (it can read lower than trained under an alpha
 * clone or a lapsed expert system), the same field
 * `features/skills/queueStatus.ts`'s trained-skills read already prefers.
 */
export function jobSlotSkillsFromCharacterSkills(skills: readonly CharacterSkill[]): JobSlotSkills {
  const levelOf = (skillId: number) =>
    skills.find((skill) => skill.skill_id === skillId)?.active_skill_level ?? 0;

  return {
    massProduction: levelOf(SKILL_ID.massProduction),
    advancedMassProduction: levelOf(SKILL_ID.advancedMassProduction),
    laboratoryOperation: levelOf(SKILL_ID.laboratoryOperation),
    advancedLaboratoryOperation: levelOf(SKILL_ID.advancedLaboratoryOperation),
    massReactions: levelOf(SKILL_ID.massReactions),
    advancedMassReactions: levelOf(SKILL_ID.advancedMassReactions),
  };
}
