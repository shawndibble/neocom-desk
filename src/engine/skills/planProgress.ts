import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { normalizePlanWithBoundaries } from './plan';
import { remainingSpForLevel, spBetween } from './sp';

export interface PlanProgress {
  trainedSp: number;
  totalSp: number;
  fraction: number | null;
}

const EMPTY: PlanProgress = { trainedSp: 0, totalSp: 0, fraction: null };

export function planProgress(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): PlanProgress {
  const known = entries.filter((e) => skills.has(e.skillTypeID));
  let steps;
  try {
    steps = normalizePlanWithBoundaries(known, skills).steps;
  } catch {
    return EMPTY;
  }
  let trainedSp = 0;
  let totalSp = 0;
  for (const { skillTypeID, level } of steps) {
    const rank = skills.get(skillTypeID)!.rank;
    const required = spBetween(rank, level - 1, level);
    const sp = trainedSkills.get(skillTypeID)?.sp ?? 0;
    totalSp += required;
    trainedSp += required - remainingSpForLevel(rank, level, sp);
  }
  return { trainedSp, totalSp, fraction: totalSp > 0 ? trainedSp / totalSp : null };
}
