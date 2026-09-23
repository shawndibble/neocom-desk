/** One Mastery tier's skills, rows, and aggregate progress. Reuses `buildFitCheckRows`'s per-skill status/time rule so Fit Check and Mastery report the same thing for the same skill. */
import type { EngineSkill, ScheduledStep, TrainedSkill } from '@/engine/types';
import type { SkillPrereq } from '@/sde/types';
import { buildFitCheckRows, type FitCheckRow } from './fitCheckRows';

export interface MasteryTierRow {
  /** 0-4 (Mastery I-V). */
  tier: number;
  rows: FitCheckRow[];
  /** Every skill in the bundle already trained to its required level (vacuously true for an empty bundle). */
  complete: boolean;
  /** Sum of each row's remaining seconds; 0 once `complete`. */
  totalSeconds: number;
}

/** `scheduled` must be this tier's own computed schedule (its bundle only) — a shared cross-tier schedule would double-count seconds for a skill two tiers both require at different levels. */
export function buildMasteryTierRow(
  tier: number,
  bundle: readonly SkillPrereq[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  scheduled: readonly ScheduledStep[]
): MasteryTierRow {
  const rows = buildFitCheckRows(
    bundle.map((s) => ({ skillTypeID: s.skillTypeID, targetLevel: s.level })),
    skills,
    trainedSkills,
    scheduled
  );
  return {
    tier,
    rows,
    complete: rows.every((r) => r.status === 'trained'),
    totalSeconds: rows.reduce((sum, r) => sum + r.seconds, 0),
  };
}
