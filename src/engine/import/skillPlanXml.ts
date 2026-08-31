/**
 * Map a plan-XML intermediate object (already decompressed/parsed one layer
 * up, in src/features — DOMParser output never reaches this module) into
 * PlanEntry[]. Round-trip partner of the EVEMon/.emp `<plan>` export format:
 * one `<entry skill="..." level="..." priority="...">` per skill.
 */

import type { PlanEntry, PlanPriority } from '@/engine/types';

export interface PlanXmlEntryInput {
  skillName: string;
  skillID?: number;
  level: number;
  /** Raw EVEMon priority attribute: integer 1 (most urgent) .. 99, default 3. */
  priority?: number;
}

/** Plain, engine-safe intermediate shape — no DOM node types. */
export interface PlanXmlDocument {
  name?: string;
  entries: PlanXmlEntryInput[];
}

export interface SkillPlanXmlError {
  /** Human locator: element index + skill name, since XML has no useful "line". */
  path: string;
  reason: string;
}

export interface SkillPlanXmlResult {
  entries: PlanEntry[];
  errors: SkillPlanXmlError[];
}

/** Minimal catalog shape needed to resolve a skill name to a typeID. */
export type SkillCatalog = ReadonlyMap<string, { typeID: number }>;

/**
 * Map EVEMon's numeric priority (1 = most urgent .. 99, default 3) onto this
 * app's three-band `PlanPriority` (#27: Skill priorities and bands). The
 * threshold is EVEMon's own default value — a file that never touched
 * priority reads as 'normal', matching this app's own "absent means normal"
 * default (bands.ts) rather than introducing a second scale.
 */
function mapImportPriority(raw: number): PlanPriority {
  if (raw < 3) return 'high';
  if (raw > 3) return 'low';
  return 'normal';
}

/**
 * Parse a plan-XML intermediate object into plan entries. Never throws:
 * unresolvable names and out-of-range levels become error entries instead.
 * Duplicate entries for the same skill keep the highest level seen (and that
 * winning entry's priority), matching PlanEntry's "train up to this level"
 * semantics and skillPlanPaste's dedup rule.
 */
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
      // Omit the key entirely when absent — an explicit `priority: undefined`
      // would later clobber an already-set priority when a caller merges
      // this entry into an existing plan via object-spread (upsertEntry).
      byTypeID.set(skill.typeID, {
        skillTypeID: skill.typeID,
        targetLevel: entry.level,
        ...(entry.priority !== undefined ? { priority: mapImportPriority(entry.priority) } : {}),
      });
    }
  });

  return { entries: [...byTypeID.values()], errors };
}
