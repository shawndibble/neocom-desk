import { computeSkillGaps } from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { planEntryKey } from '@/engine/skills/plan';
import type { PlanEntry, PlanStep } from '@/engine/types';

export type FitGoalState = 'flyable-now' | 'in-plan' | 'missing';

export interface FitGoal {
  state: FitGoalState;
  anchor: PlanStep | null;
  missing: PlanEntry[];
  missingLevels: number;
}

export function fittingNeededSkills(
  fitting: Fitting,
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>
): PlanEntry[] {
  return computeSkillGaps(fitting, requirementsByType, new Map()).missing;
}

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
