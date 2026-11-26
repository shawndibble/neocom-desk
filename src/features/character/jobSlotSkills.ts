import type { CharacterSkill, IndustryJob, SkillQueueEntry } from '@/esi/endpoints';
import type { JobSlotJob, JobSlotSkills } from '@/engine/industry/jobSlots';
import { effectiveSkillLevels } from '@/features/skills/effectiveSkillLevels';

const SKILL_ID = {
  massProduction: 3387,
  advancedMassProduction: 24625,
  laboratoryOperation: 3406,
  advancedLaboratoryOperation: 24624,
  massReactions: 45748,
  advancedMassReactions: 45749,
} as const satisfies Record<keyof JobSlotSkills, number>;

export function jobSlotSkillsFromCharacterSkills(
  skills: readonly CharacterSkill[],
  queueEntries: readonly SkillQueueEntry[] = [],
  nowMs: number = Date.now()
): JobSlotSkills {
  const levelById = effectiveSkillLevels(skills, queueEntries, nowMs);
  const levelOf = (skillId: number) => levelById.get(skillId) ?? 0;

  return {
    massProduction: levelOf(SKILL_ID.massProduction),
    advancedMassProduction: levelOf(SKILL_ID.advancedMassProduction),
    laboratoryOperation: levelOf(SKILL_ID.laboratoryOperation),
    advancedLaboratoryOperation: levelOf(SKILL_ID.advancedLaboratoryOperation),
    massReactions: levelOf(SKILL_ID.massReactions),
    advancedMassReactions: levelOf(SKILL_ID.advancedMassReactions),
  };
}

export function toJobSlotJobs(
  jobs: readonly Pick<IndustryJob, 'activity_id' | 'end_date'>[]
): JobSlotJob[] {
  return jobs.map((job) => ({ activityId: job.activity_id, endMs: Date.parse(job.end_date) }));
}
