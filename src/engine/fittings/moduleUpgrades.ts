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
import { scheduledSkillTargets } from './skillGains';
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

/** One step of a Skill Plan schedule, as far as an upgrade needs it. */
export interface ScheduleStepLike {
  skillTypeID: number;
  level: number;
  seconds: number;
}

/** What `evaluateModuleUpgrades` works from — the engine and the schedule, injected. */
export interface EvaluateModuleUpgradesOptions<
  S,
  G extends { metrics: { overall: number } },
  Step extends ScheduleStepLike = ScheduleStepLike,
> {
  /** The open Fitting the upgrades swap modules on. */
  fitting: Fitting;
  /** The pilot's skill levels: what a requirement is met against. */
  levels: ReadonlyMap<number, number>;
  /** Every skill `typeId` needs in `rack`, at the level it asks. */
  requirements: (typeId: number, rack: string) => readonly PlanEntry[];
  /** The schedule that trains `entries`, prerequisites included; null when it can't be worked out yet. */
  schedule: (entries: readonly PlanEntry[]) => readonly Step[] | null;
  /** `variant`'s stats once `trained` is, beside the open Fitting's own. */
  compare: (variant: Fitting, trained: readonly PlanEntry[]) => Promise<{ before: S; after: S }>;
  /** How the upgraded fit compares — `levelGain`. */
  gain: (before: S, after: S) => G;
  /** Whether the upgraded fit still fits its CPU, powergrid and calibration. */
  fits: (after: S) => boolean;
  /** Awaited before each calculation — hands the main thread back between them. */
  between?: () => Promise<void>;
  /** Checked after each wait; true stops the run, which then resolves null. */
  cancelled?: () => boolean;
}

export type ModuleUpgradeGain<G, Step extends ScheduleStepLike = ScheduleStepLike> = ModuleUpgrade &
  G & {
    /** The Tech II's requirements the pilot lacks — what a Skill Plan gets. */
    required: PlanEntry[];
    /** The schedule that trains them, prerequisites first. */
    scheduled: readonly Step[];
  };

/**
 * Works out each upgrade, one at a time, with every copy swapped and the
 * whole schedule that unlocks the Tech II trained — prerequisites too, since
 * the pilot will have them by then. Keeps, in candidate order, those that
 * need something trained (a swap the pilot can already make is the
 * Variations panel's), still fit, and come out better overall. An upgrade
 * whose calculation throws is left out, not the run.
 */
export async function evaluateModuleUpgrades<
  S,
  G extends { metrics: { overall: number } },
  Step extends ScheduleStepLike = ScheduleStepLike,
>(
  candidates: readonly ModuleUpgrade[],
  options: EvaluateModuleUpgradesOptions<S, G, Step>
): Promise<ModuleUpgradeGain<G, Step>[] | null> {
  const { fitting, levels, requirements, schedule, compare, gain, fits, between, cancelled } =
    options;
  const rows: ModuleUpgradeGain<G, Step>[] = [];
  for (const upgrade of candidates) {
    if (between) await between();
    if (cancelled?.()) return null;
    try {
      const rack = upgrade.at[0]?.slot;
      if (!rack) continue;
      const required = unmetRequirements(requirements(upgrade.toTypeId, rack), levels);
      if (required.length === 0) continue;
      const scheduled = schedule(required);
      if (!scheduled) continue;
      const trained = scheduledSkillTargets(scheduled);
      const { before, after } = await compare(applyModuleUpgrade(fitting, upgrade), trained);
      const described = gain(before, after);
      if (!fits(after) || described.metrics.overall <= 0) continue;
      rows.push({ ...upgrade, ...described, required, scheduled });
    } catch {
      // Left out — see above.
    }
  }
  if (cancelled?.()) return null;
  return rows;
}

/** `rows` ordered by `sort`, largest improvement first, ties by Tech II type id. A new array. */
export function rankModuleUpgrades<
  K extends string,
  T extends ModuleUpgrade & { metrics: Record<K, number> },
>(rows: readonly T[], sort: K): T[] {
  return [...rows].sort((a, b) => b.metrics[sort] - a.metrics[sort] || a.toTypeId - b.toTypeId);
}
