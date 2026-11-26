import { commonGroups, propulsionKindOf, type JobCommonality } from '../hullCommonality';
import type { DefenseChoice, ImproveGoal, ModulePool } from './improve';
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
import {
  HELD_EVERY_COPY,
  holdsTankModules,
  propulsionNeedOf,
  unguardedJobs,
  type JobSetting,
} from './improveJob';
import type { VariationIndex } from '../../market/variations';
import type { FittingModule, FittingSlotKind } from '../types';

const EXCLUDED_META_GROUPS: ReadonlySet<number> = new Set([5, 6]);

export function offerableIn(
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  pool: ModulePool | undefined,
  includeOfficer: boolean
): (typeId: number, slot: FittingSlotKind) => boolean {
  return (typeId, slot) =>
    rackOf[String(typeId)] === slot &&
    (!pool || pool.published(typeId)) &&
    (includeOfficer || !EXCLUDED_META_GROUPS.has(index.types[typeId]?.metaGroupId ?? 0)) &&
    (pool?.flyable?.(slot, typeId) ?? true);
}

export const FILL_RACKS: readonly FittingSlotKind[] = ['high', 'medium', 'low', 'rig'];

export function defenseSides(
  modules: readonly FittingModule[],
  groupOf: (typeId: number) => number | undefined,
  defense: DefenseChoice
): DefenseSide[] {
  if (defense !== 'keep') return [defense];
  const side = fittedSide(modules, groupOf);
  return side ? [side] : ['shield', 'armor'];
}

export function fittedSide(
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
  includeRigs: boolean;
  jobSetting?: JobSetting;
  commonality?: JobCommonality | null;
  nameOf?: (typeId: number) => string | undefined;
}

export interface CandidateFilter {
  sides: readonly DefenseSide[];
  goalGroups: readonly number[];
  commonGroups: readonly number[];
  freesTank: boolean;
  usesRack: (slot: FittingSlotKind) => boolean;
  tankBlocks: (toGroup: number | undefined, fromGroup: number | undefined) => boolean;
  uniqueBlocks: (
    toGroup: number | undefined,
    fromGroup: number | undefined,
    removed: number
  ) => boolean;
  losesJob: (
    toGroup: number | undefined,
    fromGroup: number | undefined,
    removed: number
  ) => boolean;
  kindBlocks: (toTypeId: number, fromTypeId: number | null) => boolean;
  firstFreeSlot: (
    slot: FittingSlotKind,
    slotCounts: Readonly<Record<FittingSlotKind, number>>
  ) => number | null;
}

const ANALYZER_GROUP = 538;

export function candidateFilter(
  modules: readonly FittingModule[],
  groupOf: (typeId: number) => number | undefined,
  { goal, defense, includeRigs, jobSetting, commonality, nameOf }: CandidateFilterInput
): CandidateFilter {
  const sides = defenseSides(modules, groupOf, defense);
  const freesTank = defense !== 'keep' && TANK_GOALS.has(goal);
  const holdsTank = holdsTankModules(jobSetting);
  const scored: readonly Job[] = unguardedJobs(goal, jobSetting?.job);
  const holdsMwd = propulsionNeedOf(jobSetting) === 'mwd';
  const kindOf = (typeId: number | null) =>
    typeId === null ? null : propulsionKindOf(groupOf(typeId), nameOf?.(typeId));
  const heldWhole: readonly Job[] = jobSetting ? HELD_EVERY_COPY[jobSetting.job] : [];
  const sitesOf = (typeId: number | null): readonly ('data' | 'relic')[] | null => {
    if (typeId === null || groupOf(typeId) !== ANALYZER_GROUP) return null;
    const name = nameOf?.(typeId) ?? '';
    if (/integrated/i.test(name)) return ['data', 'relic'];
    if (/relic/i.test(name)) return ['relic'];
    if (/data/i.test(name)) return ['data'];
    return null;
  };
  const losesSiteType = (toTypeId: number, fromTypeId: number | null) => {
    const was = sitesOf(fromTypeId);
    if (!was) return false;
    const now = sitesOf(toTypeId) ?? [];
    return was.some((site) => !now.includes(site));
  };

  const groupsFitted = new Map<number, number>();
  const jobsFitted = new Map<Job, number>();
  for (const module of modules) {
    const group = groupOf(module.typeId);
    if (group === undefined) continue;
    groupsFitted.set(group, (groupsFitted.get(group) ?? 0) + 1);
    const job = jobOf(group);
    if (job) jobsFitted.set(job, (jobsFitted.get(job) ?? 0) + 1);
  }

  const base = reworkGroups(goal, sides);
  const added = commonGroups(commonality).filter((group) => !base.includes(group));

  return {
    sides,
    goalGroups: [...base, ...added],
    commonGroups: added,
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
    kindBlocks: (toTypeId, fromTypeId) => {
      const from = kindOf(fromTypeId);
      return (
        (from === 'mjd' && kindOf(toTypeId) !== 'mjd') ||
        (holdsMwd && from === 'mwd' && kindOf(toTypeId) !== 'mwd') ||
        (jobSetting?.noPropulsion === true && from === null && kindOf(toTypeId) !== null) ||
        losesSiteType(toTypeId, fromTypeId)
      );
    },
    firstFreeSlot: (slot, slotCounts) => {
      const taken = new Set(modules.filter((m) => m.slot === slot).map((m) => m.slotIndex));
      let free = 0;
      while (free < slotCounts[slot] && taken.has(free)) free++;
      return free < slotCounts[slot] ? free : null;
    },
  };
}
