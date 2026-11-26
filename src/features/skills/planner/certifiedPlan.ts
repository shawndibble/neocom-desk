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

export function untrainedEntries(
  plan: CertifiedPlan,
  trained: TrainedLevels
): CertifiedPlan['entries'] {
  return plan.entries.filter((e) => isUntrained(trained, e.skillTypeID, e.level));
}

export function isPlanCompleted(plan: CertifiedPlan, trained: TrainedLevels): boolean {
  return untrainedEntries(plan, trained).length === 0;
}

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
