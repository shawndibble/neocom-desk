import type { EngineSkill, PlanEntry, PlanStep, TrainedSkill } from '@/engine/types';

/** `findRemovalBlockers`'s Map key for one (skillTypeID, level) pair. */
export function planEntryKey(skillTypeID: number, level: number): string {
  return `${skillTypeID}:${level}`;
}

export interface NormalizedPlan {
  steps: PlanStep[];
  /**
   * entryBoundaries[i] = steps.length after processing entries[0..i]
   * inclusive, so steps.slice(entryBoundaries[i-1] ?? 0, entryBoundaries[i])
   * is exactly the sub-range entry i contributed (its own levels, plus any
   * prereq levels not already covered by an earlier entry).
   */
  entryBoundaries: number[];
}

/**
 * Expand plan entries into per-level steps, and record which sub-range of
 * `steps` each entry contributed. See normalizePlan for the expansion rules.
 */
export function normalizePlanWithBoundaries(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill> = new Map()
): NormalizedPlan {
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

  const entryBoundaries: number[] = [];
  for (const entry of entries) {
    add(entry.skillTypeID, entry.targetLevel);
    entryBoundaries.push(steps.length);
  }
  return { steps, entryBoundaries };
}

/**
 * Which entries would silently reappear (as a dimmed prereq row,
 * normalizePlan's `add` recursion) the instant they're removed, because some
 * other entry still needs that exact (skillTypeID, level) — either as a real
 * cross-skill prerequisite, or as a rung a higher level of the *same* skill
 * climbs through on the way up. Order-independent: which entry "depends" on
 * which is a property of the requirement graph, not of list position.
 *
 * Keyed by `planEntryKey`, each flagged entry maps to *an* other entry that
 * still needs it (the one whose own `add` recursion first pushed the step
 * back in) — not necessarily the only one, but enough to name in a "why can't
 * I remove this" message. Removing entry i and re-running
 * normalizePlanWithBoundaries is the simplest correct check — the resulting
 * step *set* never depends on entry order (each step is a no-op once its
 * skill's running max is already at or past it) — and `entryBoundaries`
 * hands back which remaining entry owns the reinstated step for free.
 */
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
  trainedSkills: ReadonlyMap<number, TrainedSkill> = new Map()
): PlanStep[] {
  return normalizePlanWithBoundaries(entries, skills, trainedSkills).steps;
}
