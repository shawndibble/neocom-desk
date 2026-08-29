import type { EngineSkill, PlanEntry, PlanStep, TrainedSkill } from '@/engine/types';

/**
 * Expand plan entries into per-level steps:
 * - each entry becomes the missing levels I..target,
 * - prerequisites are inserted recursively before dependents,
 * - already-trained and already-planned levels are skipped,
 * - user order is preserved where prerequisites allow.
 */
export function normalizePlan(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill> = new Map(),
): PlanStep[] {
  const steps: PlanStep[] = [];
  const planned = new Map<number, number>(); // typeID -> highest level already in steps
  const visiting = new Set<number>(); // cycle guard for current prereq path

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

  for (const entry of entries) add(entry.skillTypeID, entry.targetLevel);
  return steps;
}
