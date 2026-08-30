/**
 * "Suggest full reorder": group plan steps by (primary, secondary) attribute
 * pair to reduce remap-boundary fragmentation, while honoring prerequisites
 * and keeping the original relative order within each group (stable).
 *
 * Prereq-constrained grouped emission: groups are ordered by first occurrence;
 * repeatedly scan groups in order, emitting each group's ready steps. A step is
 * ready once every lower plan level of its own skill and every plan level
 * covered by its prereqs has been emitted (levels absent from the plan count
 * as already trained). Each pass over a valid plan emits at least one step, so
 * this terminates with a valid permutation.
 */
import { pairKey } from '@/engine/optimizer/bestAttributes';
import type { EngineSkill, PlanStep } from '@/engine/types';

interface PlanIndex {
  /** Sorted plan levels per skill. */
  planLevels: Map<number, number[]>;
  emitted: Map<number, Set<number>>;
}

function buildPlanIndex(steps: readonly PlanStep[]): PlanIndex {
  const planLevels = new Map<number, number[]>();
  for (const step of steps) {
    const levels = planLevels.get(step.skillTypeID) ?? [];
    levels.push(step.level);
    planLevels.set(step.skillTypeID, levels);
  }
  for (const levels of planLevels.values()) levels.sort((a, b) => a - b);
  return { planLevels, emitted: new Map() };
}

/** All plan levels of `typeID` up to `level` already emitted? */
function requirementMet(index: PlanIndex, typeID: number, level: number): boolean {
  const levels = index.planLevels.get(typeID);
  if (!levels) return true; // not in plan: assume already trained
  const emitted = index.emitted.get(typeID);
  for (const l of levels) {
    if (l > level) break;
    if (!emitted?.has(l)) return false;
  }
  return true;
}

function isReady(
  index: PlanIndex,
  step: PlanStep,
  skills: ReadonlyMap<number, EngineSkill>
): boolean {
  const skill = skills.get(step.skillTypeID);
  if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
  if (!requirementMet(index, step.skillTypeID, step.level - 1)) return false;
  return skill.prereqs.every((p) => requirementMet(index, p.typeID, p.level));
}

function markEmitted(index: PlanIndex, step: PlanStep): void {
  let set = index.emitted.get(step.skillTypeID);
  if (!set) {
    set = new Set();
    index.emitted.set(step.skillTypeID, set);
  }
  set.add(step.level);
}

/** True when `steps` satisfies same-skill level order and in-plan prereqs. */
export function isValidOrder(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>
): boolean {
  const index = buildPlanIndex(steps);
  for (const step of steps) {
    if (!isReady(index, step, skills)) return false;
    markEmitted(index, step);
  }
  return true;
}

/** Reorder steps grouped by attribute pair; prereq-valid and stable. */
export function suggestReorder(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>
): PlanStep[] {
  const groups: PlanStep[][] = [];
  const groupByPair = new Map<string, PlanStep[]>();
  for (const step of steps) {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const key = pairKey(skill.primary, skill.secondary);
    let group = groupByPair.get(key);
    if (!group) {
      group = [];
      groupByPair.set(key, group);
      groups.push(group);
    }
    group.push(step);
  }

  const index = buildPlanIndex(steps);
  const heads = groups.map(() => 0);
  const result: PlanStep[] = [];
  while (result.length < steps.length) {
    let emittedThisPass = 0;
    for (let g = 0; g < groups.length; g++) {
      while (heads[g] < groups[g].length && isReady(index, groups[g][heads[g]], skills)) {
        const step = groups[g][heads[g]++];
        markEmitted(index, step);
        result.push(step);
        emittedThisPass++;
      }
    }
    if (emittedThisPass === 0) {
      throw new Error('Plan has unsatisfiable prerequisites; cannot reorder');
    }
  }
  return result;
}
