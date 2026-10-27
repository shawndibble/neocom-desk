/**
 * One Character's gap to a Fitting: which skills they still lack and the
 * time to train them, from the same schedule "What to train" and Fit Check
 * use. Pure — the caller supplies the missing skills (`computeSkillGaps`) and
 * the schedule that trains them (`scheduleEntries`).
 */
import type { PlanEntry, ScheduledStep } from '@/engine/types';

export interface GapSkill {
  skillTypeID: number;
  /** The highest level the schedule trains this skill to. */
  targetLevel: number;
  /** Time spent on this skill across the schedule. */
  seconds: number;
  /** The Fitting asks for this skill; false for a prerequisite the schedule pulls in. */
  direct: boolean;
}

export interface CharacterFlyGap {
  /** Skills the Fitting requires that the Character lacks — the active-Character gap count. */
  missingCount: number;
  /** The whole schedule, prerequisites included. */
  totalSeconds: number;
  /** Every skill the schedule trains, in training order. */
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
