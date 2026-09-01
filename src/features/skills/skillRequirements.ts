import type { SkillCatalog } from './skillMap';
import type { TrainedSkill } from '@/engine/types';
import { stripEveMarkup } from './typeDisplay';

export interface PrereqRow {
  typeID: number;
  name: string;
  level: number;
  /** Whether the character's trained level already meets `level`. */
  trained: boolean;
}

export type UnlockRow = Omit<PrereqRow, 'trained'>;

export interface SkillRequirements {
  name: string;
  /** Markup-stripped skill description, for display above the requirements. Null when the skill has none. */
  description: string | null;
  prereqs: PrereqRow[];
  unlocks: UnlockRow[];
}

function skillName(catalog: SkillCatalog, typeID: number): string {
  return catalog.bySkillTypeID.get(typeID)?.name ?? `#${typeID}`;
}

/**
 * A skill's prerequisites (trained vs. still needed) and what it unlocks, for
 * the skill inspector. Shared by every surface that lets a user select a
 * skill (the Skills page, the plan's SkillPicker) so the row-building logic
 * lives in one place.
 */
export function buildSkillRequirements(
  catalog: SkillCatalog,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  typeID: number
): SkillRequirements | null {
  const engineSkill = catalog.engineSkills.get(typeID);
  const info = catalog.bySkillTypeID.get(typeID);
  if (!engineSkill || !info) return null;

  const prereqs: PrereqRow[] = engineSkill.prereqs.map((p) => ({
    typeID: p.typeID,
    name: skillName(catalog, p.typeID),
    level: p.level,
    trained: (trainedSkills.get(p.typeID)?.level ?? 0) >= p.level,
  }));
  const unlocks: UnlockRow[] = (catalog.unlocksByTypeID.get(typeID) ?? []).map((u) => ({
    typeID: u.typeID,
    name: skillName(catalog, u.typeID),
    level: u.level,
  }));

  return {
    name: info.name,
    description: info.description ? stripEveMarkup(info.description) : null,
    prereqs,
    unlocks,
  };
}
