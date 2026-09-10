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

/** Display order every job-slot readout in the app follows. */
export const JOB_SLOT_CATEGORIES: readonly JobSlotCategory[] = [
  'manufacturing',
  'science',
  'reaction',
];

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

/** One character's job-slot inputs, adapted to this module's shapes. Either field undefined: not loaded/known for this character yet. */
export interface JobSlotCharacterInput {
  skills: JobSlotSkills | undefined;
  jobs: readonly JobSlotJob[] | undefined;
}

/**
 * Open/max slot counts per category, summed across every character passed
 * in. A character missing skills or jobs data for a category simply doesn't
 * contribute to that category's sum — never guessed as zero — so one
 * not-yet-loaded alt in a multi-character selection doesn't blank out
 * everyone else's known capacity. A category comes back undefined only when
 * *no* character in the set has both pieces known for it.
 */
export function aggregateJobSlotSummary(
  characters: readonly JobSlotCharacterInput[],
  nowMs: number
): Record<JobSlotCategory, { open: number; max: number } | undefined> {
  const totals: Record<JobSlotCategory, { open: number; max: number }> = {
    manufacturing: { open: 0, max: 0 },
    science: { open: 0, max: 0 },
    reaction: { open: 0, max: 0 },
  };
  let anyKnown = false;

  for (const character of characters) {
    if (character.skills === undefined || character.jobs === undefined) continue;
    anyKnown = true;
    const max = maxJobSlots(character.skills);
    const running = runningJobCountsByCategory(character.jobs, nowMs);
    for (const category of JOB_SLOT_CATEGORIES) {
      totals[category].open += max[category] - running[category];
      totals[category].max += max[category];
    }
  }

  if (!anyKnown) {
    return { manufacturing: undefined, science: undefined, reaction: undefined };
  }
  return totals;
}
