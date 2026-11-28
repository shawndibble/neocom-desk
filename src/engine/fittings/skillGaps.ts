import type { PlanEntry } from '@/engine/types';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { Fitting, FittingModule, FittingStats } from './types';

export interface SkillGaps {
  unusableModuleKeys: ReadonlySet<string>;
  missing: PlanEntry[];
}

export function moduleKey(module: Pick<FittingModule, 'slot' | 'slotIndex'>): string {
  return `${module.slot}-${module.slotIndex}`;
}

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

export function resourceOverage(used: number | null, total: number | null): number {
  if (used === null || total === null) return 0;
  return used > total ? used - total : 0;
}

const TIGHT_RESOURCE_SHARE = 0.98;

export function resourceTight(used: number | null, total: number | null): boolean {
  if (used === null || total === null || total <= 0) return false;
  return used <= total && used / total >= TIGHT_RESOURCE_SHARE;
}

export function budgetOverages(stats: FittingStats): [number, number, number] {
  return [
    resourceOverage(stats.cpuUsed, stats.cpuTotal),
    resourceOverage(stats.powergridUsed, stats.powergridTotal),
    resourceOverage(stats.calibrationUsed, stats.calibrationTotal),
  ];
}

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
