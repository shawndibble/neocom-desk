/**
 * How many industry jobs a character can run at once, per job-slot pool
 * (support.eveonline.com "Invention"; EVE Ref skill pages 3387/24625,
 * 3406/24624, 45748/45749).
 *
 * Every category shares the same shape: one free slot, plus one more per
 * level of a basic skill and its "Advanced" counterpart (5 + 5, so 11 at
 * both maxed) — manufacturing (Mass Production / Advanced Mass Production),
 * science (Laboratory Operation / Advanced Laboratory Operation), and
 * reaction (Mass Reactions / Advanced Mass Reactions).
 *
 * "Science" is the EVE-standard umbrella for the four activities that draw
 * from the *same* laboratory slots — time efficiency research, material
 * efficiency research, copying, and invention — not a fourth, separate pool.
 *
 * Pure: no fetch/DOM/Dexie. Callers adapt ESI's `CharacterSkill[]` (skill
 * ids) and `IndustryJob[]` (activity ids, ISO dates) to this module's named
 * shapes at the boundary (ARCHITECTURE.md).
 */

export type JobSlotCategory = 'manufacturing' | 'science' | 'reaction';

/** Active levels of the six skills that grant extra job slots. */
export interface JobSlotSkills {
  massProduction: number;
  advancedMassProduction: number;
  laboratoryOperation: number;
  advancedLaboratoryOperation: number;
  massReactions: number;
  advancedMassReactions: number;
}

/** Every character can run this many jobs per category with no relevant skill trained at all. */
const BASE_SLOTS = 1;

export function maxJobSlots(skills: JobSlotSkills): Record<JobSlotCategory, number> {
  return {
    manufacturing: BASE_SLOTS + skills.massProduction + skills.advancedMassProduction,
    science: BASE_SLOTS + skills.laboratoryOperation + skills.advancedLaboratoryOperation,
    reaction: BASE_SLOTS + skills.massReactions + skills.advancedMassReactions,
  };
}

/**
 * The slot pool an EVE industry activity id draws from, or null for an id
 * this app doesn't otherwise recognise (`features/industry/jobs.ts`'s
 * `ACTIVITY_NAMES` lists the same six: 1, 3, 4, 5, 8, 11).
 */
export function jobSlotCategory(activityId: number): JobSlotCategory | null {
  switch (activityId) {
    case 1:
      return 'manufacturing';
    case 3: // time efficiency research
    case 4: // material efficiency research
    case 5: // copying
    case 8: // invention — classed as a science job (support.eveonline.com "Invention")
      return 'science';
    case 11:
      return 'reaction';
    default:
      return null;
  }
}

export interface JobSlotJob {
  activityId: number;
  /** Epoch ms the job finishes. */
  endMs: number;
}

/** How many of a job list are still running (not yet at `endMs`), per category. */
export function runningJobCountsByCategory(
  jobs: readonly JobSlotJob[],
  nowMs: number
): Record<JobSlotCategory, number> {
  const counts: Record<JobSlotCategory, number> = { manufacturing: 0, science: 0, reaction: 0 };
  for (const job of jobs) {
    if (job.endMs <= nowMs) continue;
    const category = jobSlotCategory(job.activityId);
    if (category) counts[category] += 1;
  }
  return counts;
}
