import { normalizePlan } from '@/engine/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import type { CharacterAttribute } from '@/sde/types';
import type { SkillCatalog } from './skillMap';
import { stripEveMarkup } from './typeDisplay';

export interface PrereqRow {
  typeID: number;
  name: string;
  level: number;
  /** Whether the character's trained level already meets `level`. */
  trained: boolean;
  /** Whether an open plan already trains `level` or higher — as an entry or a prerequisite it schedules — independent of `trained`. */
  planned: boolean;
}

export type UnlockRow = Omit<PrereqRow, 'trained' | 'planned'>;

export interface SkillRequirements {
  name: string;
  /** Markup-stripped skill description, for display above the requirements. Null when the skill has none. */
  description: string | null;
  groupName: string;
  /** Training time multiplier. */
  rank: number;
  primaryAttr: CharacterAttribute;
  secondaryAttr: CharacterAttribute;
  /** The fixed NPC skillbook price (SDE basePrice). Null when the SDE gives none. */
  npcPrice: number | null;
  prereqs: PrereqRow[];
  unlocks: UnlockRow[];
}

/**
 * The highest level a plan trains each skill to: its entries, plus the
 * prerequisites it schedules on the way to them (a plan with Frigate I trains
 * Spaceship Command III too). A plan that can't be scheduled counts its
 * entries alone — reporting the cycle is the Skill Plan editor's job.
 */
function plannedLevels(
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
  } catch {
    // Circular prerequisites: the entries above still count.
  }
  return levels;
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
