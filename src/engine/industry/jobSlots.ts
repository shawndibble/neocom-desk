export type JobSlotCategory = 'manufacturing' | 'science' | 'reaction';

export const JOB_SLOT_CATEGORIES: readonly JobSlotCategory[] = [
  'manufacturing',
  'science',
  'reaction',
];

export interface JobSlotSkills {
  massProduction: number;
  advancedMassProduction: number;
  laboratoryOperation: number;
  advancedLaboratoryOperation: number;
  massReactions: number;
  advancedMassReactions: number;
}

const BASE_SLOTS = 1;

export function maxJobSlots(skills: JobSlotSkills): Record<JobSlotCategory, number> {
  return {
    manufacturing: BASE_SLOTS + skills.massProduction + skills.advancedMassProduction,
    science: BASE_SLOTS + skills.laboratoryOperation + skills.advancedLaboratoryOperation,
    reaction: BASE_SLOTS + skills.massReactions + skills.advancedMassReactions,
  };
}

export function jobSlotCategory(activityId: number): JobSlotCategory | null {
  switch (activityId) {
    case 1:
      return 'manufacturing';
    case 3:
    case 4:
    case 5:
    case 8:
      return 'science';
    case 11:
      return 'reaction';
    default:
      return null;
  }
}

export interface JobSlotJob {
  activityId: number;
  endMs: number;
}

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

export interface JobSlotCharacterInput {
  skills: JobSlotSkills | undefined;
  jobs: readonly JobSlotJob[] | undefined;
}

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

export interface JobFinishProjection {
  open: number;
  startMs: number;
  finishMs: number;
}

export function slotFreeTimes(
  character: { skills: JobSlotSkills; jobs: readonly JobSlotJob[] },
  category: JobSlotCategory,
  nowMs: number
): number[] {
  const max = Math.max(1, maxJobSlots(character.skills)[category]);
  const runningEnds = character.jobs
    .filter((job) => job.endMs > nowMs && jobSlotCategory(job.activityId) === category)
    .map((job) => job.endMs)
    .sort((a, b) => a - b);
  const open = Math.max(0, max - runningEnds.length);
  return [...new Array<number>(open).fill(nowMs), ...runningEnds].slice(-max);
}

export function projectJobFinish(
  character: { skills: JobSlotSkills; jobs: readonly JobSlotJob[] },
  category: JobSlotCategory,
  seconds: number,
  nowMs: number
): JobFinishProjection {
  const freeTimes = slotFreeTimes(character, category, nowMs);
  const open = freeTimes.filter((ms) => ms === nowMs).length;
  const startMs = freeTimes[0] ?? nowMs;
  return { open, startMs, finishMs: startMs + seconds * 1000 };
}
