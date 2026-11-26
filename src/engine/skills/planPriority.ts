import type { EngineSkill, PlanEntry, PlanPriority } from '@/engine/types';

export const PRIORITY_ORDER: readonly PlanPriority[] = ['high', 'normal', 'low'];

export function priorityRank(priority: PlanPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

export function higherPriority(a: PlanPriority, b: PlanPriority): PlanPriority {
  return priorityRank(a) <= priorityRank(b) ? a : b;
}

export function effectivePriority(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>
): Map<number, PlanPriority> {
  const result = new Map<number, PlanPriority>();
  const queue: { typeID: number; priority: PlanPriority }[] = [];

  for (const entry of entries) {
    if (!skills.has(entry.skillTypeID)) {
      throw new Error(`Unknown skill typeID ${entry.skillTypeID}`);
    }
    queue.push({ typeID: entry.skillTypeID, priority: entry.priority ?? 'normal' });
  }

  while (queue.length > 0) {
    const { typeID, priority } = queue.pop()!;
    const existing = result.get(typeID);
    if (existing !== undefined && priorityRank(existing) <= priorityRank(priority)) continue;
    result.set(typeID, existing === undefined ? priority : higherPriority(existing, priority));
    const skill = skills.get(typeID);
    if (!skill) continue;
    for (const prereq of skill.prereqs) queue.push({ typeID: prereq.typeID, priority });
  }

  return result;
}
