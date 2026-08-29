/**
 * Parse pasted skill-plan text back into PlanEntry[].
 *
 * Round-trip partner of `clipboardExport.ts` (EVE's in-game "import skill
 * queue from clipboard" format: "<Skill Name> <Roman numeral>"). Also
 * tolerates the arabic-level variant used by EVEMon/EveLens exports
 * ("Skill Name 4") and trailing SP annotations some tools append
 * ("Skill Name IV (1,234,567 SP)").
 */

import type { PlanEntry } from '@/engine/types';

const ROMAN_TO_LEVEL: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

export interface SkillPlanParseError {
  /** 1-indexed source line number (blank lines still count toward the count). */
  line: number;
  /** Original line text, trimmed. */
  text: string;
  reason: string;
}

export interface SkillPlanParseResult {
  entries: PlanEntry[];
  errors: SkillPlanParseError[];
}

/** Minimal catalog shape needed to resolve a skill name to a typeID. */
export type SkillCatalog = ReadonlyMap<string, { typeID: number }>;

const BULLET_PREFIX = /^[-*•·]\s*/;
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/;
// Level token is matched loosely (any digits, or I/II/III/IV/V) so out-of-range
// values (e.g. "9", "VI") still reach the explicit range check below instead
// of falling through to the generic "no level found" error.
const NAME_AND_LEVEL = /^(.*\S)\s+(I{1,3}|IV|V|[0-9]+)$/i;

function parseLevel(token: string): number | null {
  const roman = ROMAN_TO_LEVEL[token.toUpperCase()];
  if (roman !== undefined) return roman;
  const n = Number(token);
  return Number.isInteger(n) ? n : null;
}

/**
 * Parse a paste of "<Skill Name> <level>" lines into plan entries.
 * Never throws: unrecognized lines and unknown skill names become error
 * entries instead. Duplicate lines for the same skill keep the highest
 * level seen (matches PlanEntry's "train up to this level" semantics).
 */
export function parseSkillPlanPaste(text: string, skillByName: SkillCatalog): SkillPlanParseResult {
  const lines = text.split(/\r\n|\r|\n/);
  const errors: SkillPlanParseError[] = [];
  const byTypeID = new Map<number, PlanEntry>();

  lines.forEach((rawLine, i) => {
    const trimmed = rawLine.trim();
    if (trimmed === '') return;

    const stripped = trimmed.replace(BULLET_PREFIX, '').replace(TRAILING_PAREN, '').trim();
    const match = NAME_AND_LEVEL.exec(stripped);
    if (!match) {
      errors.push({
        line: i + 1,
        text: trimmed,
        reason: 'no skill level found (expected roman numeral I-V or 1-5)',
      });
      return;
    }

    const [, name, levelToken] = match;
    const level = parseLevel(levelToken);
    if (level === null || level < 1 || level > 5) {
      errors.push({ line: i + 1, text: trimmed, reason: `level out of range 1..5: ${levelToken}` });
      return;
    }

    const skill = skillByName.get(name.toLowerCase());
    if (!skill) {
      errors.push({ line: i + 1, text: trimmed, reason: `unknown skill: ${name}` });
      return;
    }

    const existing = byTypeID.get(skill.typeID);
    if (!existing || level > existing.targetLevel) {
      byTypeID.set(skill.typeID, { skillTypeID: skill.typeID, targetLevel: level });
    }
  });

  return { entries: [...byTypeID.values()], errors };
}
