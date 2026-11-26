import type { EngineSkill, PlanEntry, PlanStep, TrainedSkill } from '@/engine/types';

export function planEntryKey(skillTypeID: number, level: number): string {
  return `${skillTypeID}:${level}`;
}

export interface NormalizedPlan {
  steps: PlanStep[];
  entryBoundaries: number[];
}

export function normalizePlanWithBoundaries(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill> = new Map()
): NormalizedPlan {
  const steps: PlanStep[] = [];
  const planned = new Map<number, number>();
  const visiting = new Set<number>();

  const currentLevel = (typeID: number): number =>
    Math.max(planned.get(typeID) ?? 0, trainedSkills.get(typeID)?.level ?? 0);

  const add = (typeID: number, targetLevel: number): void => {
    const skill = skills.get(typeID);
    if (!skill) throw new Error(`Unknown skill typeID ${typeID}`);
    if (currentLevel(typeID) >= targetLevel) return;
    if (visiting.has(typeID)) {
      throw new Error(`Circular prerequisites involving "${skill.name}" (${typeID})`);
    }
    visiting.add(typeID);
    for (const prereq of skill.prereqs) add(prereq.typeID, prereq.level);
    visiting.delete(typeID);
    for (let level = currentLevel(typeID) + 1; level <= targetLevel; level++) {
      steps.push({ skillTypeID: typeID, level });
      planned.set(typeID, level);
    }
  };

  const entryBoundaries: number[] = [];
  for (const entry of entries) {
    add(entry.skillTypeID, entry.targetLevel);
    entryBoundaries.push(steps.length);
  }
  return { steps, entryBoundaries };
}

export function findRemovalBlockers(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill> = new Map()
): Map<string, PlanEntry> {
  const blockers = new Map<string, PlanEntry>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const without = entries.filter((_, idx) => idx !== i);
    const { steps, entryBoundaries } = normalizePlanWithBoundaries(without, skills, trainedSkills);
    const stepIndex = steps.findIndex(
      (s) => s.skillTypeID === entry.skillTypeID && s.level === entry.targetLevel
    );
    if (stepIndex === -1) continue;
    const ownerIndex = entryBoundaries.findIndex((boundary) => stepIndex < boundary);
    if (ownerIndex === -1) continue;
    blockers.set(planEntryKey(entry.skillTypeID, entry.targetLevel), without[ownerIndex]);
  }
  return blockers;
}

export function normalizePlan(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill> = new Map()
): PlanStep[] {
  return normalizePlanWithBoundaries(entries, skills, trainedSkills).steps;
}
