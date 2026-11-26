import { normalizePlan } from '@/engine/skills/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import type { CharacterAttribute } from '@/sde/types';
import type { SkillCatalog } from './skillMap';
import { stripEveMarkup } from './typeDisplay';

export interface PrereqRow {
  typeID: number;
  name: string;
  level: number;
  trained: boolean;
  planned: boolean;
}

export type UnlockRow = Omit<PrereqRow, 'trained' | 'planned'>;

export interface SkillRequirements {
  name: string;
  description: string | null;
  groupName: string;
  rank: number;
  primaryAttr: CharacterAttribute;
  secondaryAttr: CharacterAttribute;
  npcPrice: number | null;
  prereqs: PrereqRow[];
  unlocks: UnlockRow[];
}

export function plannedLevels(
  planEntries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): Map<number, number> {
  const levels = new Map<number, number>();
  const raise = (typeID: number, level: number) =>
    levels.set(typeID, Math.max(levels.get(typeID) ?? 0, level));
  for (const entry of planEntries) raise(entry.skillTypeID, entry.targetLevel);
  try {
    const known = planEntries.filter((entry) => skills.has(entry.skillTypeID));
    for (const step of normalizePlan(known, skills, trainedSkills)) {
      raise(step.skillTypeID, step.level);
    }
  } catch {}
  return levels;
}

function skillName(catalog: SkillCatalog, typeID: number): string {
  return catalog.bySkillTypeID.get(typeID)?.name ?? `#${typeID}`;
}

export function buildSkillRequirements(
  catalog: SkillCatalog,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  typeID: number,
  planEntries: readonly PlanEntry[] = []
): SkillRequirements | null {
  const engineSkill = catalog.engineSkills.get(typeID);
  const info = catalog.bySkillTypeID.get(typeID);
  if (!engineSkill || !info) return null;

  const planned = plannedLevels(planEntries, catalog.engineSkills, trainedSkills);
  const prereqs: PrereqRow[] = engineSkill.prereqs.map((p) => ({
    typeID: p.typeID,
    name: skillName(catalog, p.typeID),
    level: p.level,
    trained: (trainedSkills.get(p.typeID)?.level ?? 0) >= p.level,
    planned: (planned.get(p.typeID) ?? 0) >= p.level,
  }));
  const unlocks: UnlockRow[] = (catalog.unlocksByTypeID.get(typeID) ?? []).map((u) => ({
    typeID: u.typeID,
    name: skillName(catalog, u.typeID),
    level: u.level,
  }));

  return {
    name: info.name,
    description: info.description ? stripEveMarkup(info.description) : null,
    groupName: info.groupName,
    rank: info.rank,
    primaryAttr: info.primaryAttr,
    secondaryAttr: info.secondaryAttr,
    npcPrice: info.basePrice ? info.basePrice : null,
    prereqs,
    unlocks,
  };
}
