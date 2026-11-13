/**
 * What the active Character can't yet use on an open Fitting (issue #1534):
 * which modules they lack the skills for, and the skills they'd need to
 * train to use all of it. Pure — the caller supplies each type's required
 * skills (from dogma data) and the pilot's Effective Skill Levels.
 */
import type { PlanEntry } from '@/engine/types';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { Fitting, FittingModule, FittingStats } from './types';

export interface SkillGaps {
  /** `moduleKey` of every module the pilot lacks a required skill level for. */
  unusableModuleKeys: ReadonlySet<string>;
  /** One entry per skill lacksSkill of the Fitting's highest requirement, at that level. */
  missing: PlanEntry[];
}

export function moduleKey(module: Pick<FittingModule, 'slot' | 'slotIndex'>): string {
  return `${module.slot}-${module.slotIndex}`;
}

/** Every type id whose requirements gate this Fitting (cargo never does). */
export function fittingRequirementTypeIds(
  fitting: Pick<Fitting, 'shipTypeId' | 'modules' | 'drones' | 'fighters'>
): number[] {
  const ids = new Set<number>([fitting.shipTypeId]);
  for (const module of fitting.modules) {
    ids.add(module.typeId);
    if (module.chargeTypeId !== undefined) ids.add(module.chargeTypeId);
  }
  for (const drone of fitting.drones) ids.add(drone.typeId);
  for (const fighter of fitting.fighters ?? []) ids.add(fighter.typeId);
  return [...ids];
}

/** Amount by which `used` exceeds `total`; 0 when within budget or either is unknown. */
export function resourceOverage(used: number | null, total: number | null): number {
  if (used === null || total === null) return 0;
  return used > total ? used - total : 0;
}

/** How far `stats` is over its CPU, powergrid and calibration budgets, in that order; 0 for each within. */
export function budgetOverages(stats: FittingStats): [number, number, number] {
  return [
    resourceOverage(stats.cpuUsed, stats.cpuTotal),
    resourceOverage(stats.powergridUsed, stats.powergridTotal),
    resourceOverage(stats.calibrationUsed, stats.calibrationTotal),
  ];
}

/** Whole-fit CPU/PG/calibration budget only — deliberately not hull/rack rules, which `candidates.ts`'s `fitsHull` already owns and deliberately excludes resource overflow from. */
export function fitsResourceBudget(stats: FittingStats): boolean {
  return (
    resourceOverage(stats.cpuUsed, stats.cpuTotal) === 0 &&
    resourceOverage(stats.powergridUsed, stats.powergridTotal) === 0 &&
    resourceOverage(stats.calibrationUsed, stats.calibrationTotal) === 0
  );
}

export interface ResourceBudgetOverage {
  resource: 'cpu' | 'powergrid' | 'calibration';
  amount: number;
}

/** The first of CPU/PG/calibration a Fitting is over budget on, or null when none is — the same check `fitsResourceBudget` passes/fails on. */
export function firstResourceOverage(stats: FittingStats): ResourceBudgetOverage | null {
  const checks = [
    { resource: 'cpu', amount: resourceOverage(stats.cpuUsed, stats.cpuTotal) },
    { resource: 'powergrid', amount: resourceOverage(stats.powergridUsed, stats.powergridTotal) },
    {
      resource: 'calibration',
      amount: resourceOverage(stats.calibrationUsed, stats.calibrationTotal),
    },
  ] as const;
  return checks.find((check) => check.amount > 0) ?? null;
}

function lacksSkillAt(skillLevels: ReadonlyMap<number, number>) {
  return (req: RequiredSkill) => (skillLevels.get(req.skillTypeID) ?? 0) < req.level;
}

/**
 * The skills a pilot lacks to use every one of `typeIds`: one entry per skill,
 * at the highest level any of them requires. The one "Missing N skills" rule —
 * the editor's chip and each Popular fit's verdict both read it.
 */
export function missingSkillEntries(
  typeIds: Iterable<number>,
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>,
  skillLevels: ReadonlyMap<number, number>
): PlanEntry[] {
  const lacksSkill = lacksSkillAt(skillLevels);
  const highest = new Map<number, number>();
  for (const typeId of typeIds) {
    for (const req of requirementsByType.get(typeId) ?? []) {
      if (lacksSkill(req))
        highest.set(req.skillTypeID, Math.max(highest.get(req.skillTypeID) ?? 0, req.level));
    }
  }
  return [...highest].map(([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel }));
}

/** The `typeIds` the pilot lacks a required skill level for: the "Can't use" rule. */
export function unusableTypeIds(
  typeIds: Iterable<number>,
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>,
  skillLevels: ReadonlyMap<number, number>
): Set<number> {
  const lacksSkill = lacksSkillAt(skillLevels);
  const unusable = new Set<number>();
  for (const typeId of typeIds) {
    if ((requirementsByType.get(typeId) ?? []).some(lacksSkill)) unusable.add(typeId);
  }
  return unusable;
}

export function computeSkillGaps(
  fitting: Fitting,
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>,
  skillLevels: ReadonlyMap<number, number>
): SkillGaps {
  const unusableTypes = unusableTypeIds(
    fitting.modules.map((module) => module.typeId),
    requirementsByType,
    skillLevels
  );
  const unusable = new Set(
    fitting.modules.filter((module) => unusableTypes.has(module.typeId)).map(moduleKey)
  );
  const missing = missingSkillEntries(
    fittingRequirementTypeIds(fitting),
    requirementsByType,
    skillLevels
  );
  return { unusableModuleKeys: unusable, missing };
}
