import type { VariationIndex } from '../market/variations';
import { getVariations } from '../market/variations';
import type { PlanEntry } from '../types';
import { swapModuleType, type ModuleAt } from './fittingEdit';
import { scheduledSkillTargets } from './skillGains';
import type { Fitting, FittingModule, FittingSlotKind } from './types';

const TECH_I = 1;
const TECH_II = 2;

export interface ModuleUpgrade {
  fromTypeId: number;
  toTypeId: number;
  at: ModuleAt[];
}

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

export function applyModuleUpgrade(fitting: Fitting, upgrade: ModuleUpgrade): Fitting {
  return upgrade.at.reduce(
    (fit, { slot, slotIndex }) => swapModuleType(fit, slot, slotIndex, upgrade.toTypeId),
    fitting
  );
}

export function unmetRequirements(
  required: readonly PlanEntry[],
  levels: ReadonlyMap<number, number>
): PlanEntry[] {
  return required.filter(
    ({ skillTypeID, targetLevel }) => (levels.get(skillTypeID) ?? 0) < targetLevel
  );
}

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
  includesPrerequisites: boolean;
}

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

export interface ScheduleStepLike {
  skillTypeID: number;
  level: number;
  seconds: number;
}

export interface EvaluateModuleUpgradesOptions<
  S,
  G extends { metrics: { overall: number } },
  Step extends ScheduleStepLike = ScheduleStepLike,
> {
  fitting: Fitting;
  levels: ReadonlyMap<number, number>;
  requirements: (typeId: number, rack: FittingSlotKind) => readonly PlanEntry[];
  schedule: (entries: readonly PlanEntry[]) => readonly Step[] | null;
  compare: (variant: Fitting, trained: readonly PlanEntry[]) => Promise<{ before: S; after: S }>;
  gain: (before: S, after: S) => G;
  fits: (after: S) => boolean;
  between?: () => Promise<void>;
  cancelled?: () => boolean;
}

export type ModuleUpgradeGain<G, Step extends ScheduleStepLike = ScheduleStepLike> = ModuleUpgrade &
  G & {
    required: PlanEntry[];
    scheduled: readonly Step[];
  };

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
    } catch {}
  }
  if (cancelled?.()) return null;
  return rows;
}

export function rankModuleUpgrades<
  K extends string,
  T extends ModuleUpgrade & { metrics: Record<K, number> },
>(rows: readonly T[], sort: K): T[] {
  return [...rows].sort((a, b) => b.metrics[sort] - a.metrics[sort] || a.toTypeId - b.toTypeId);
}
