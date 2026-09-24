/**
 * What the active Character can't yet use on an open Fitting (issue #1534):
 * which modules they lack the skills for, and the skills they'd need to
 * train to use all of it. Pure — the caller supplies each type's required
 * skills (from dogma data) and the pilot's Effective Skill Levels.
 */
import type { PlanEntry } from '@/engine/types';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { Fitting, FittingModule } from './types';

export interface SkillGaps {
  /** `moduleKey` of every module the pilot lacks a required skill level for. */
  unusableModuleKeys: ReadonlySet<string>;
  /** One entry per skill lacksSkill of the Fitting's highest requirement, at that level. */
  missing: PlanEntry[];
}

export function moduleKey(module: Pick<FittingModule, 'slot' | 'slotIndex'>): string {
  return `${module.slot}-${module.slotIndex}`;
}

/** Every type id whose requirements gate this Fitting. */
export function fittingRequirementTypeIds(fitting: Fitting): number[] {
  const ids = new Set<number>([fitting.shipTypeId]);
  for (const module of fitting.modules) {
    ids.add(module.typeId);
    if (module.chargeTypeId !== undefined) ids.add(module.chargeTypeId);
  }
  for (const drone of fitting.drones) ids.add(drone.typeId);
  return [...ids];
}

/** Amount by which `used` exceeds `total`; 0 when within budget or either is unknown. */
export function resourceOverage(used: number | null, total: number | null): number {
  if (used === null || total === null) return 0;
  return used > total ? used - total : 0;
}

export function computeSkillGaps(
  fitting: Fitting,
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>,
  skillLevels: ReadonlyMap<number, number>
): SkillGaps {
  const lacksSkill = (req: RequiredSkill) => (skillLevels.get(req.skillTypeID) ?? 0) < req.level;

  const unusable = new Set<string>();
  for (const module of fitting.modules) {
    if ((requirementsByType.get(module.typeId) ?? []).some(lacksSkill))
      unusable.add(moduleKey(module));
  }

  const highest = new Map<number, number>();
  for (const typeId of fittingRequirementTypeIds(fitting)) {
    for (const req of requirementsByType.get(typeId) ?? []) {
      if (lacksSkill(req))
        highest.set(req.skillTypeID, Math.max(highest.get(req.skillTypeID) ?? 0, req.level));
    }
  }
  const missing = [...highest].map(([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel }));

  return { unusableModuleKeys: unusable, missing };
}
