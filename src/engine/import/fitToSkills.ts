import type { PlanEntry } from '@/engine/types';
import type { EftFit } from '@/engine/import/eftFit';

export interface RequiredSkill {
  skillTypeID: number;
  level: number;
}

export type RequiredSkillsLookup = (typeID: number) => readonly RequiredSkill[];

export type TypeCatalog = ReadonlyMap<string, { typeID: number }>;

export interface FitToSkillsError {
  itemName: string;
  reason: string;
}

export interface FitToSkillsResult {
  entries: PlanEntry[];
  errors: FitToSkillsError[];
}

export type FitItems = Pick<EftFit, 'shipName' | 'items'>;

export function fitToSkills(
  fit: FitItems,
  typeByName: TypeCatalog,
  requiredSkills: RequiredSkillsLookup
): FitToSkillsResult {
  const errors: FitToSkillsError[] = [];
  const levelByTypeID = new Map<number, number>();

  const parts = fit.shipName ? [{ name: fit.shipName, quantity: 1 }, ...fit.items] : fit.items;

  for (const { name } of parts) {
    const type = typeByName.get(name.toLowerCase());
    if (!type) {
      errors.push({ itemName: name, reason: 'unknown item' });
      continue;
    }
    for (const req of requiredSkills(type.typeID)) {
      const current = levelByTypeID.get(req.skillTypeID) ?? 0;
      if (req.level > current) levelByTypeID.set(req.skillTypeID, req.level);
    }
  }

  const entries: PlanEntry[] = [...levelByTypeID.entries()]
    .map(([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel }))
    .sort((a, b) => a.skillTypeID - b.skillTypeID);

  return { entries, errors };
}
