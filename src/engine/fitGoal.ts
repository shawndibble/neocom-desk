/**
 * Fit goal (GLOSSARY.md "Plan Milestone"): the skill levels a saved Fitting
 * needs, checked against a Skill Plan's normalized steps. The requirement
 * aggregation is `computeSkillGaps`'s own, asked about a pilot who trained
 * nothing — one rule for what a Fitting needs, not a second copy.
 */
import { computeSkillGaps } from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { planEntryKey } from '@/engine/skills/plan';
import type { PlanEntry, PlanStep } from '@/engine/types';

export type FitGoalState = 'flyable-now' | 'in-plan' | 'missing';

export interface FitGoal {
  /** 'flyable-now': all trained. 'in-plan': all trained or planned. 'missing': the plan stops short. */
  state: FitGoalState;
  /** The latest needed step in training order; null when flyable now or when levels are missing. */
  anchor: PlanStep | null;
  /** One entry per skill whose needed level the plan doesn't reach — add these, prerequisites follow. */
  missing: PlanEntry[];
  /** Skill levels in `missing` not yet trained or planned. */
  missingLevels: number;
}

/** Highest level of every skill the hull, modules, charges, drones and fighters need. */
export function fittingNeededSkills(
  fitting: Fitting,
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>
): PlanEntry[] {
  return computeSkillGaps(fitting, requirementsByType, new Map()).missing;
}

/**
 * `steps` is the plan's normalized per-level order, `trainedLevels` the
 * Character's levels per skill. A needed level is satisfied by training or
 * by a step; the anchor is the last such step, so the goal's date is when
 * that step finishes.
 */
export function evaluateFitGoal(
  needed: readonly PlanEntry[],
  trainedLevels: ReadonlyMap<number, number>,
  steps: readonly PlanStep[]
): FitGoal {
  const indexByKey = new Map(steps.map((s, i) => [planEntryKey(s.skillTypeID, s.level), i]));
  const missing: PlanEntry[] = [];
  let missingLevels = 0;
  let anchorIndex = -1;

  for (const { skillTypeID, targetLevel } of needed) {
    const trained = trainedLevels.get(skillTypeID) ?? 0;
    if (trained >= targetLevel) continue;
    const index = indexByKey.get(planEntryKey(skillTypeID, targetLevel));
    if (index === undefined) {
      missing.push({ skillTypeID, targetLevel });
      for (let level = trained + 1; level <= targetLevel; level++) {
        if (!indexByKey.has(planEntryKey(skillTypeID, level))) missingLevels++;
      }
    } else if (index > anchorIndex) {
      anchorIndex = index;
    }
  }

  if (missing.length > 0) return { state: 'missing', anchor: null, missing, missingLevels };
  if (anchorIndex < 0) return { state: 'flyable-now', anchor: null, missing, missingLevels: 0 };
  const { skillTypeID, level } = steps[anchorIndex];
  return { state: 'in-plan', anchor: { skillTypeID, level }, missing, missingLevels: 0 };
}
