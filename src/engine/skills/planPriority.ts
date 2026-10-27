/**
 * Priority propagation for Skill Plan entries (#27: Skill priorities and
 * bands). A user marks entries high/normal/low; a prerequisite must never
 * read as less urgent than anything that depends on it, so its *effective*
 * priority is the most urgent priority among itself and every entry that
 * (directly or transitively) needs it.
 */
import type { EngineSkill, PlanEntry, PlanPriority } from '@/engine/types';

/** Every priority, most urgent first — the canonical order for UI display too. */
export const PRIORITY_ORDER: readonly PlanPriority[] = ['high', 'normal', 'low'];

/** Lower rank = more urgent. */
export function priorityRank(priority: PlanPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

/** Whichever of the two is more urgent. */
export function higherPriority(a: PlanPriority, b: PlanPriority): PlanPriority {
  return priorityRank(a) <= priorityRank(b) ? a : b;
}

/**
 * Effective priority per skill typeID touched by `entries`: each entry's own
 * priority (default 'normal'), propagated to every prerequisite it pulls in
 * so a prerequisite is never less urgent than its most urgent dependent.
 * Skills untouched by any entry or prereq chain are absent from the result.
 */
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
    if (!skill) continue; // prereq outside the catalog: nothing further to propagate
    for (const prereq of skill.prereqs) queue.push({ typeID: prereq.typeID, priority });
  }

  return result;
}
