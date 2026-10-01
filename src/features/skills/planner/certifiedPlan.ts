/**
 * "New plan from a Certified Plan" (issue #2392): turns one of CCP's
 * Certified Skill Plans (`CertifiedPlan`, baked from the SDE) into a Skill
 * Plan record. Pure — the dialog loads the plans and the skill names, and the
 * plan list pane writes the record.
 */
import type { SkillPlanRecord } from '@/db';
import type { PlanEntry, PlanMilestone } from '@/engine/types';
import type { CertifiedPlan } from '@/sde/types';
import { newPlan } from './newPlan';
import { appendImportedEntries } from './reorder';
import { normalizeMilestones } from './milestones';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/**
 * A new plan holding the certified plan's levels in CCP's order. Entries go
 * through the same append rule every import uses, so a level an earlier row
 * already covers never lands as a second row; levels the character already
 * has stay in, exactly as any other import leaves them, and show as trained.
 *
 * CCP's milestones become Plan Milestones named after their skill level
 * ("Industry IV") — CCP gives them no name of their own. The key is omitted
 * when there are none, as a plan copy omits it: Firestore rejects `undefined`.
 */
export function certifiedPlanRecord(
  characterId: number,
  plan: CertifiedPlan,
  skillNameFor: (skillTypeID: number) => string,
  remapCount: number
): SkillPlanRecord {
  const entries = appendImportedEntries(
    [],
    plan.entries.map((e): PlanEntry => ({ skillTypeID: e.skillTypeID, targetLevel: e.level }))
  );
  const milestones = normalizeMilestones(
    plan.milestones.map((m): PlanMilestone => ({
      id: crypto.randomUUID(),
      name: `${skillNameFor(m.skillTypeID)} ${ROMAN[m.level - 1]}`,
      skillTypeID: m.skillTypeID,
      level: m.level,
    }))
  );
  return {
    ...newPlan(characterId, plan.name, remapCount),
    entries,
    ...(milestones.length > 0 ? { milestones } : {}),
  };
}

export interface CareerPathGroup {
  careerPathId: number;
  plans: CertifiedPlan[];
}

/** Plans grouped by career path, groups in career path id order, each group keeping the list's order. */
export function groupByCareerPath(plans: readonly CertifiedPlan[]): CareerPathGroup[] {
  const byPath = new Map<number, CertifiedPlan[]>();
  for (const plan of plans) {
    const group = byPath.get(plan.careerPathId);
    if (group) group.push(plan);
    else byPath.set(plan.careerPathId, [plan]);
  }
  return [...byPath]
    .sort(([a], [b]) => a - b)
    .map(([careerPathId, group]) => ({ careerPathId, plans: group }));
}
