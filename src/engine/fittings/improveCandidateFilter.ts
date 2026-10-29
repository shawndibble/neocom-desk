/**
 * The rules `improveCandidates` and the Makeover's `makeoverMoves` share when
 * they decide what may replace or fill a slot (issue #5575): which racks are
 * searched, the fit's Defense sides, the job guard (the last module doing a
 * job nobody scores, every copy of an Explore kit job), the Explore tank
 * hold, the unique-group rule and the first free slot of a rack. Each rule is
 * one method, so a caller composes the ones it applies and a rule exists once.
 * Pure data over the fit's modules; the type catalogue is injected as
 * `groupOf`.
 */
import type { DefenseChoice, ImproveGoal } from './improve';
import {
  jobOf,
  reworkGroups,
  sideOf,
  TANK_GOALS,
  TANK_GROUPS,
  UNIQUE_GROUPS,
  type DefenseSide,
  type Job,
} from './improveGroups';
import { HELD_EVERY_COPY, holdsTankModules, unguardedJobs, type JobSetting } from './improveJob';
import type { FittingModule, FittingSlotKind } from './types';

/** The racks an empty slot is filled in. */
export const FILL_RACKS: readonly FittingSlotKind[] = ['high', 'medium', 'low', 'rig'];

/** The tank sides a search uses: the chosen one, else the fit's own, else both. */
export function defenseSides(
  modules: readonly FittingModule[],
  groupOf: (typeId: number) => number | undefined,
  defense: DefenseChoice
): DefenseSide[] {
  if (defense !== 'keep') return [defense];
  const side = fittedSide(modules, groupOf);
  return side ? [side] : ['shield', 'armor'];
}

/** The side of the tank the fit already has; null when it has none (or an even split). */
function fittedSide(
  modules: readonly FittingModule[],
  groupOf: (typeId: number) => number | undefined
): DefenseSide | null {
  let shield = 0;
  let armor = 0;
  for (const module of modules) {
    const side = sideOf(groupOf(module.typeId) ?? -1);
    if (side === 'shield') shield++;
    else if (side === 'armor') armor++;
  }
  if (shield === armor) return null;
  return shield > armor ? 'shield' : 'armor';
}

export interface CandidateFilterInput {
  goal: ImproveGoal;
  defense: DefenseChoice;
  /** Rigs are their own group, left out unless ticked. */
  includeRigs: boolean;
  /** The job and its space: its freed and held jobs, and the Explore tank hold. Absent: today's guard. */
  jobSetting?: JobSetting;
}

export interface CandidateFilter {
  /** The Defense sides the search works on. */
  sides: readonly DefenseSide[];
  /** The goal's Rework groups for those sides. */
  goalGroups: readonly number[];
  /** A chosen side with a tank goal frees the other side's tank modules. */
  freesTank: boolean;
  /** Whether the rack is searched: never subsystems, rigs only when included. */
  usesRack: (slot: FittingSlotKind) => boolean;
  /**
   * Whether `toGroup` may take the place of a `fromGroup` module (or an empty
   * slot): nothing but a tank module turns into one on a freed tank, and an
   * Explore fit that holds its tank keeps a tank module a tank module.
   */
  tankBlocks: (toGroup: number | undefined, fromGroup: number | undefined) => boolean;
  /** Whether `toGroup` is a second unique module once `removed` copies of `fromGroup` leave. */
  uniqueBlocks: (
    toGroup: number | undefined,
    fromGroup: number | undefined,
    removed: number
  ) => boolean;
  /** Whether replacing `removed` copies of a `fromGroup` module by `toGroup` ends the last module doing a job nobody scores. */
  losesJob: (
    toGroup: number | undefined,
    fromGroup: number | undefined,
    removed: number
  ) => boolean;
  /** The first empty slot index of the rack, or null when it is full. */
  firstFreeSlot: (
    slot: FittingSlotKind,
    slotCounts: Readonly<Record<FittingSlotKind, number>>
  ) => number | null;
}

/** The shared candidate filter for `modules` under the goal, Defense Choice and job. */
export function candidateFilter(
  modules: readonly FittingModule[],
  groupOf: (typeId: number) => number | undefined,
  { goal, defense, includeRigs, jobSetting }: CandidateFilterInput
): CandidateFilter {
  const sides = defenseSides(modules, groupOf, defense);
  const freesTank = defense !== 'keep' && TANK_GOALS.has(goal);
  const holdsTank = holdsTankModules(jobSetting);
  const scored: readonly Job[] = unguardedJobs(goal, jobSetting?.job);
  const heldWhole: readonly Job[] = jobSetting ? HELD_EVERY_COPY[jobSetting.job] : [];

  const groupsFitted = new Map<number, number>();
  const jobsFitted = new Map<Job, number>();
  for (const module of modules) {
    const group = groupOf(module.typeId);
    if (group === undefined) continue;
    groupsFitted.set(group, (groupsFitted.get(group) ?? 0) + 1);
    const job = jobOf(group);
    if (job) jobsFitted.set(job, (jobsFitted.get(job) ?? 0) + 1);
  }

  return {
    sides,
    goalGroups: reworkGroups(goal, sides),
    freesTank,
    usesRack: (slot) => slot !== 'subsystem' && (slot !== 'rig' || includeRigs),
    tankBlocks: (toGroup, fromGroup) => {
      const toTank = TANK_GROUPS.has(toGroup ?? -1);
      const fromTank = TANK_GROUPS.has(fromGroup ?? -1);
      return (freesTank && toTank && !fromTank) || (holdsTank && fromTank && !toTank);
    },
    uniqueBlocks: (toGroup, fromGroup, removed) => {
      if (toGroup === undefined || !UNIQUE_GROUPS.has(toGroup)) return false;
      return (groupsFitted.get(toGroup) ?? 0) - (fromGroup === toGroup ? removed : 0) > 0;
    },
    losesJob: (toGroup, fromGroup, removed) => {
      const fromJob = jobOf(fromGroup);
      if (fromJob === null || scored.includes(fromJob) || jobOf(toGroup) === fromJob) return false;
      return (jobsFitted.get(fromJob) ?? 0) - removed < 1 || heldWhole.includes(fromJob);
    },
    firstFreeSlot: (slot, slotCounts) => {
      const taken = new Set(modules.filter((m) => m.slot === slot).map((m) => m.slotIndex));
      let free = 0;
      while (free < slotCounts[slot] && taken.has(free)) free++;
      return free < slotCounts[slot] ? free : null;
    },
  };
}
