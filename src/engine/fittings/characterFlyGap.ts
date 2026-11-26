import type { PlanEntry, ScheduledStep } from '@/engine/types';

export interface GapSkill {
  skillTypeID: number;
  targetLevel: number;
  seconds: number;
  direct: boolean;
}

export interface CharacterFlyGap {
  missingCount: number;
  totalSeconds: number;
  skills: GapSkill[];
}

export function characterFlyGap(
  missing: readonly PlanEntry[],
  scheduled: readonly Pick<ScheduledStep, 'skillTypeID' | 'level' | 'seconds'>[]
): CharacterFlyGap {
  const direct = new Set(missing.map((entry) => entry.skillTypeID));
  const bySkill = new Map<number, GapSkill>();
  let totalSeconds = 0;
  for (const step of scheduled) {
    totalSeconds += step.seconds;
    const row = bySkill.get(step.skillTypeID) ?? {
      skillTypeID: step.skillTypeID,
      targetLevel: 0,
      seconds: 0,
      direct: direct.has(step.skillTypeID),
    };
    row.targetLevel = Math.max(row.targetLevel, step.level);
    row.seconds += step.seconds;
    bySkill.set(step.skillTypeID, row);
  }
  return { missingCount: missing.length, totalSeconds, skills: [...bySkill.values()] };
}
