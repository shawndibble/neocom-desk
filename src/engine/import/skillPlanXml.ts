import type { PlanEntry, PlanPriority } from '@/engine/types';

export interface PlanXmlEntryInput {
  skillName: string;
  skillID?: number;
  level: number;
  priority?: number;
}

export interface PlanXmlDocument {
  name?: string;
  entries: PlanXmlEntryInput[];
}

export interface SkillPlanXmlError {
  path: string;
  reason: string;
}

export interface SkillPlanXmlResult {
  entries: PlanEntry[];
  errors: SkillPlanXmlError[];
}

export type SkillCatalog = ReadonlyMap<string, { typeID: number }>;

function mapImportPriority(raw: number): PlanPriority {
  if (raw < 3) return 'high';
  if (raw > 3) return 'low';
  return 'normal';
}

export function parseSkillPlanXml(
  doc: PlanXmlDocument,
  skillByName: SkillCatalog
): SkillPlanXmlResult {
  const errors: SkillPlanXmlError[] = [];
  const byTypeID = new Map<number, PlanEntry>();

  doc.entries.forEach((entry, i) => {
    const path = `entry[${i}] "${entry.skillName}"`;

    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 5) {
      errors.push({ path, reason: `level out of range 1..5: ${entry.level}` });
      return;
    }

    const skill = skillByName.get(entry.skillName.toLowerCase());
    if (!skill) {
      errors.push({ path, reason: `unknown skill: ${entry.skillName}` });
      return;
    }

    const existing = byTypeID.get(skill.typeID);
    if (!existing || entry.level > existing.targetLevel) {
      byTypeID.set(skill.typeID, {
        skillTypeID: skill.typeID,
        targetLevel: entry.level,
        ...(entry.priority !== undefined ? { priority: mapImportPriority(entry.priority) } : {}),
      });
    }
  });

  return { entries: [...byTypeID.values()], errors };
}
