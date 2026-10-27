/**
 * "New certified plan" (issue #2392): turns one of CCP's
 * Certified Skill Plans (`CertifiedPlan`, baked from the SDE) into a Skill
 * Plan record. Pure — the dialog loads the plans and the skill names, and the
 * plan list pane writes the record.
 */
import type { SkillPlanRecord } from '@/db';
import type { PlanEntry, PlanMilestone, TrainedSkill } from '@/engine/types';
import type { CertifiedPlan } from '@/sde/types';
import { newPlan } from './newPlan';
import { appendImportedEntries } from './reorder';
import { normalizeMilestones } from './milestones';
import { romanLevel } from '@/engine/projection';

export type TrainedLevels = ReadonlyMap<number, TrainedSkill>;

function isUntrained(trained: TrainedLevels, skillTypeID: number, level: number): boolean {
  return (trained.get(skillTypeID)?.level ?? 0) < level;
}

/** The plan's levels the character has not trained yet, in CCP's order. */
export function untrainedEntries(
  plan: CertifiedPlan,
  trained: TrainedLevels
): CertifiedPlan['entries'] {
  return plan.entries.filter((e) => isUntrained(trained, e.skillTypeID, e.level));
}

/** True when the character already has every level the plan asks for. */
export function isPlanCompleted(plan: CertifiedPlan, trained: TrainedLevels): boolean {
  return untrainedEntries(plan, trained).length === 0;
}

/**
 * A new plan holding the certified plan's levels in CCP's order. When the
 * character's trained levels are known, only the levels not yet trained go in,
 * and milestones already reached are dropped; with `trained` null every level
 * stays. Entries go through the same append rule every import uses, so a
 * level an earlier row already covers never lands as a second row.
 *
 * CCP's milestones become Plan Milestones named after their skill level
 * ("Industry IV") — CCP gives them no name of their own. The key is omitted
 * when there are none, as a plan copy omits it: Firestore rejects `undefined`.
 */
export function certifiedPlanRecord(
  characterId: number,
  plan: CertifiedPlan,
  skillNameFor: (skillTypeID: number) => string,
  remapCount: number,
  trained: TrainedLevels | null = null
): SkillPlanRecord {
  const entries = appendImportedEntries(
    [],
    (trained ? untrainedEntries(plan, trained) : plan.entries).map((e): PlanEntry => ({
      skillTypeID: e.skillTypeID,
      targetLevel: e.level,
    }))
  );
  const milestones = normalizeMilestones(
    (trained
      ? plan.milestones.filter((m) => isUntrained(trained, m.skillTypeID, m.level))
      : plan.milestones
    ).map((m): PlanMilestone => ({
      id: crypto.randomUUID(),
      name: `${skillNameFor(m.skillTypeID)} ${romanLevel(m.level)}`,
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
