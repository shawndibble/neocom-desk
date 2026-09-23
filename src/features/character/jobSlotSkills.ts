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

/**
 * Effective level (issue #1236: min of queue-corrected trained and active),
 * not raw `active_skill_level` alone: job slots follow the level actually in
 * effect (it can read lower than trained under an alpha clone or a lapsed
 * expert system), but `active_skill_level` is exactly as stale as
 * `trained_skill_level` when a queue entry has finished and `/skills` hasn't
 * caught up — without the queue correction a just-finished level
 * undercounts slots until the character's next login.
 *
 * `queueEntries` defaults to empty for callers that don't have the queue in
 * hand — the same undercount as before this fix, not a regression.
 */
export function jobSlotSkillsFromCharacterSkills(
  skills: readonly CharacterSkill[],
  queueEntries: readonly SkillQueueEntry[] = [],
  nowMs: number = Date.now()
): JobSlotSkills {
  // One id->level map, not six `.find()` scans over the full list — a
  // veteran character's `/skills` commonly runs several hundred entries, and
  // this runs once per roster character on both the initial load and
  // "Refresh all" (`jobSlotSkillsMap`).
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

/**
 * `IndustryJob[]` (or the `ActiveJob` subset sharing these two fields) ->
 * `engine/industry/jobSlots.ts`'s named shape — the other half of this
 * file's ESI/engine boundary adaptation, shared by every caller that reads
 * running jobs for slot-count purposes (`rosterAttention.ts`,
 * `ActiveJobsPanel.tsx`) rather than each re-deriving the same mapping.
 */
export function toJobSlotJobs(
  jobs: readonly Pick<IndustryJob, 'activity_id' | 'end_date'>[]
): JobSlotJob[] {
  return jobs.map((job) => ({ activityId: job.activity_id, endMs: Date.parse(job.end_date) }));
}
