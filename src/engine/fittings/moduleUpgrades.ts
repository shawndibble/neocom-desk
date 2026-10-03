/**
 * "What to train" for a module rather than a skill level: each fitted Tech I
 * or meta module (meta group Tech I — an Enduring afterburner as much as a
 * plain one) that has a Tech II sibling for the same rack, with every copy on
 * the fit swapped together — eight 425mm Railgun I become eight IIs, one
 * suggestion. Faction, officer and Tech II modules are never "upgraded": a
 * Tech II is not reliably better than any of them. Which skills the Tech II
 * needs, the schedule that trains them and the stats it is worked out under
 * come from the caller; this module only pairs, swaps and sets levels. Pure.
 */
import type { VariationIndex } from '../market/variations';
import { getVariations } from '../market/variations';
import type { PlanEntry } from '../types';
import { swapModuleType, type ModuleAt } from './fittingEdit';
import type { Fitting, FittingModule } from './types';

const TECH_I = 1;
const TECH_II = 2;

export interface ModuleUpgrade {
  fromTypeId: number;
  toTypeId: number;
  /** Every fitted copy of `fromTypeId`, in fit order. */
  at: ModuleAt[];
}

/**
 * Each fitted Tech I module type with a Tech II sibling that goes in the same
 * rack (`rackOf`, keyed by type id), in the order its first copy is fitted.
 */
export function moduleUpgradeCandidates(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>
): ModuleUpgrade[] {
  const upgrades = new Map<number, ModuleUpgrade>();
  for (const fitted of modules) {
    const existing = upgrades.get(fitted.typeId);
    if (existing) {
      existing.at.push({ slot: fitted.slot, slotIndex: fitted.slotIndex });
      continue;
    }
    if (index.types[fitted.typeId]?.metaGroupId !== TECH_I) continue;
    const techII = getVariations(index, fitted.typeId).members.find(
      (member) => member.metaGroupId === TECH_II && rackOf[String(member.typeId)] === fitted.slot
    );
    if (!techII) continue;
    upgrades.set(fitted.typeId, {
      fromTypeId: fitted.typeId,
      toTypeId: techII.typeId,
      at: [{ slot: fitted.slot, slotIndex: fitted.slotIndex }],
    });
  }
  return [...upgrades.values()];
}

/** `fitting` with every copy the upgrade names swapped for its Tech II, state and charge kept. */
export function applyModuleUpgrade(fitting: Fitting, upgrade: ModuleUpgrade): Fitting {
  return upgrade.at.reduce(
    (fit, { slot, slotIndex }) => swapModuleType(fit, slot, slotIndex, upgrade.toTypeId),
    fitting
  );
}

/** The requirements the pilot has below the level asked — what stands between them and the module. */
export function unmetRequirements(
  required: readonly PlanEntry[],
  levels: ReadonlyMap<number, number>
): PlanEntry[] {
  return required.filter(
    ({ skillTypeID, targetLevel }) => (levels.get(skillTypeID) ?? 0) < targetLevel
  );
}

/**
 * The pilot's levels once `targets` are trained: each raised to its target,
 * none lowered — a skill override sets a level outright, so one the pilot
 * already has higher must not come back down. A new map.
 */
export function raisedSkillLevels(
  levels: ReadonlyMap<number, number>,
  targets: readonly PlanEntry[]
): Map<number, number> {
  const raised = new Map(levels);
  for (const { skillTypeID, targetLevel } of targets) {
    raised.set(skillTypeID, Math.max(raised.get(skillTypeID) ?? 0, targetLevel));
  }
  return raised;
}

export interface ScheduleTime {
  seconds: number;
  /** The schedule trains a skill other than `skillTypeIds` first — a prerequisite the pilot lacks. */
  includesPrerequisites: boolean;
}

/** The whole schedule's time, and whether it trains anything beyond the skills asked for. */
export function scheduleTimeFor(
  scheduled: readonly { skillTypeID: number; seconds: number }[],
  skillTypeIds: readonly number[]
): ScheduleTime {
  const asked = new Set(skillTypeIds);
  return {
    seconds: scheduled.reduce((sum, step) => sum + step.seconds, 0),
    includesPrerequisites: scheduled.some((step) => !asked.has(step.skillTypeID)),
  };
}
