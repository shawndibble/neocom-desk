/**
 * "Suggest full reorder": group plan steps by (primary, secondary) attribute
 * pair to reduce remap-boundary fragmentation, while honoring prerequisites
 * and keeping the original relative order within each group (stable).
 *
 * Prereq-constrained grouped emission: groups are ordered by first occurrence,
 * then stable-sorted so higher-priority groups (per `priorities`, #27) come
 * first; repeatedly scan groups in that order, emitting each group's ready
 * steps. A step is ready once every lower plan level of its own skill and
 * every plan level covered by its prereqs has been emitted (levels absent
 * from the plan count as already trained). Each pass over a valid plan emits
 * at least one step, so this terminates with a valid permutation — priority
 * only affects interleaving order, never which steps are ready, so a
 * lower-priority prerequisite still emits before the higher-priority step
 * that needs it.
 */
import { pairKey } from '@/engine/optimizer/bestAttributes';
import { priorityRank } from '@/engine/planPriority';
import { spBetween, timeToTrain, trainingRate } from '@/engine/sp';
import type {
  Attributes,
  CloneState,
  EngineSkill,
  Implants,
  PlanMilestone,
  PlanPriority,
  PlanStep,
} from '@/engine/types';

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

/**
 * Split `steps` into deadline segments: one per Plan Milestone whose anchor
 * is still in the plan, in the anchor's current order, plus a final tail of
 * everything no milestone needs. A segment holds its anchor step plus every
 * not-yet-claimed plan step the anchor transitively needs (lower levels of
 * its own skill and in-plan prereqs), so each segment is closed under
 * in-plan prerequisites and the concatenation stays prereq-valid. Reached or
 * orphaned milestones (anchor not in `steps`) are ignored. Each segment keeps
 * the original relative order of its steps.
 */
function splitByMilestones(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  milestones: readonly PlanMilestone[] | undefined
): PlanStep[][] {
  if (!milestones?.length) return [[...steps]];
  const key = (typeID: number, level: number): string => `${typeID}:${level}`;
  const position = new Map(steps.map((s, i) => [key(s.skillTypeID, s.level), i]));
  const anchors = milestones
    .map((m) => position.get(key(m.skillTypeID, m.level)))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => a - b);
  const claimed = new Set<number>();
  const segments: PlanStep[][] = [];
  for (const anchor of anchors) {
    if (claimed.has(anchor)) continue;
    const needed = new Set<number>();
    const visit = (typeID: number, level: number): void => {
      steps.forEach((s, i) => {
        if (s.skillTypeID !== typeID || s.level > level || claimed.has(i) || needed.has(i)) return;
        needed.add(i);
        for (const p of skills.get(typeID)?.prereqs ?? []) visit(p.typeID, p.level);
      });
    };
    visit(steps[anchor].skillTypeID, steps[anchor].level);
    needed.forEach((i) => claimed.add(i));
    segments.push(steps.filter((_, i) => needed.has(i)));
  }
  segments.push(steps.filter((_, i) => !claimed.has(i)));
  return segments.filter((seg) => seg.length > 0);
}

/**
 * Reorder steps grouped by attribute pair; prereq-valid and stable.
 *
 * `priorities` (#27) maps a skill typeID to the user's (or an inherited,
 * see `effectivePriority`) urgency for it; a step's group is keyed by its
 * skill's priority too, and groups are emitted highest-priority first, tied
 * groups keeping their original first-occurrence order. `milestones` makes each Plan
 * Milestone a hard deadline: its skills (and prerequisites) all come before
 * later milestones' and the rest, whatever the priority; grouping and
 * priority only interleave within a deadline segment. Omit `priorities` (or pass an
 * empty map) to fall back to pure attribute-pair grouping.
 */
function suggestReorderSegment(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  priorities?: ReadonlyMap<number, PlanPriority>
): PlanStep[] {
  const priorityFor = (typeID: number): PlanPriority => priorities?.get(typeID) ?? 'normal';

  const groups: PlanStep[][] = [];
  const groupRanks: number[] = [];
  const groupByKey = new Map<string, PlanStep[]>();
  for (const step of steps) {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const priority = priorityFor(step.skillTypeID);
    const key = `${priority}:${pairKey(skill.primary, skill.secondary)}`;
    let group = groupByKey.get(key);
    if (!group) {
      group = [];
      groupByKey.set(key, group);
      groups.push(group);
      groupRanks.push(priorityRank(priority));
    }
    group.push(step);
  }

  // Stable sort: groups tied on priority keep their first-occurrence order.
  const order = groups.map((_, i) => i).sort((a, b) => groupRanks[a] - groupRanks[b]);
  const orderedGroups = order.map((i) => groups[i]);

  const index = buildPlanIndex(steps);
  const heads = orderedGroups.map(() => 0);
  const result: PlanStep[] = [];
  while (result.length < steps.length) {
    let emittedThisPass = 0;
    for (let g = 0; g < orderedGroups.length; g++) {
      while (
        heads[g] < orderedGroups[g].length &&
        isReady(index, orderedGroups[g][heads[g]], skills)
      ) {
        const step = orderedGroups[g][heads[g]++];
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

export function suggestReorder(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  priorities?: ReadonlyMap<number, PlanPriority>,
  milestones?: readonly PlanMilestone[]
): PlanStep[] {
  return splitByMilestones(steps, skills, milestones).flatMap((seg) =>
    suggestReorderSegment(seg, skills, priorities)
  );
}

export interface SortShortestFirstOptions {
  attributes: Attributes;
  implants?: Implants;
  cloneState?: CloneState;
  /** Plan Milestones as hard deadlines; see `splitByMilestones`. */
  milestones?: readonly PlanMilestone[];
}

/**
 * Reorder steps to front-load the quick ones: prereq-valid, and honoring
 * Priority tiers (#27) — High before Normal before Low, using the same
 * already-effective `priorities` map `suggestReorder` takes, so a
 * lower-priority prerequisite already carries its dependent's urgency by the
 * time it reaches here. Within a tier, a ready-set selection repeatedly picks
 * the ready step with the lowest (priorityRank, seconds, original index) —
 * scanning ready steps in original order and only replacing the current pick
 * on a strict improvement keeps ties at the earliest index for free.
 *
 * Each step's training time is costed once, up front, Booster-blind (a
 * Booster's bonus depends on when a step lands, which this reorder decides;
 * costing against it would be circular). A linear scan per pick is fine at
 * plan sizes (~200 steps); no heap is needed unless a test shows otherwise.
 */
function sortShortestSegment(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: SortShortestFirstOptions,
  priorities?: ReadonlyMap<number, PlanPriority>
): PlanStep[] {
  const { attributes, implants = {}, cloneState } = options;
  const priorityFor = (typeID: number): PlanPriority => priorities?.get(typeID) ?? 'normal';

  const seconds = steps.map((step) => {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const sp = spBetween(skill.rank, step.level - 1, step.level);
    const rate = trainingRate(
      attributes[skill.primary] + (implants[skill.primary] ?? 0),
      attributes[skill.secondary] + (implants[skill.secondary] ?? 0),
      cloneState
    );
    return timeToTrain(sp, rate);
  });

  const index = buildPlanIndex(steps);
  const emitted = new Array(steps.length).fill(false);
  const result: PlanStep[] = [];

  while (result.length < steps.length) {
    let pickIndex = -1;
    let pickRank = Infinity;
    let pickSeconds = Infinity;
    for (let i = 0; i < steps.length; i++) {
      if (emitted[i] || !isReady(index, steps[i], skills)) continue;
      const rank = priorityRank(priorityFor(steps[i].skillTypeID));
      if (rank < pickRank || (rank === pickRank && seconds[i] < pickSeconds)) {
        pickIndex = i;
        pickRank = rank;
        pickSeconds = seconds[i];
      }
    }
    if (pickIndex === -1) {
      throw new Error('Plan has unsatisfiable prerequisites; cannot reorder');
    }
    markEmitted(index, steps[pickIndex]);
    emitted[pickIndex] = true;
    result.push(steps[pickIndex]);
  }
  return result;
}

/** `sortShortestSegment` per milestone deadline segment (`options.milestones`). */
export function sortShortestFirst(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: SortShortestFirstOptions,
  priorities?: ReadonlyMap<number, PlanPriority>
): PlanStep[] {
  return splitByMilestones(steps, skills, options.milestones).flatMap((seg) =>
    sortShortestSegment(seg, skills, options, priorities)
  );
}
