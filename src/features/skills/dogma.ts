/**
 * Pure parsing of ESI `dogma_attributes` arrays (see getUniverseType) into
 * the two shapes this feature needs: implant attribute bonuses, and a fit
 * item's required skills. No fetch/DOM here — callers (data.ts, the clipboard
 * import flow) supply the already-fetched UniverseType.
 *
 * Attribute IDs verified 2026-08 against https://everef.net/dogma-attributes
 * and cross-checked against a live ESI response for a real implant
 * (Memory Augmentation - Improved, type 10209: attribute 177 = 5.0, matching
 * its "+5 Bonus to Memory" description) and a real ship (Rifter, type 587:
 * attributes 182/277 = 3329/1, i.e. requires Minmatar Frigate I).
 *
 * IMPORTANT: the task brief's assumed requiredSkill5/6 pairing (1289→1288,
 * 1290→1287) is backwards. Verified pairing is 1289 (requiredSkill5) with
 * 1287 (requiredSkill5Level), and 1290 (requiredSkill6) with 1288
 * (requiredSkill6Level) — everef.net confirms 1287 = "requiredSkill5Level"
 * and 1288 = "requiredSkill6Level" by name, not by the task's assumed index.
 */
import type { AttributeName, Attributes, Implants } from '@/engine/types';
import type { DogmaAttribute } from '@/esi/endpoints';

/** dogma_attributes attribute_id -> the engine attribute it bonuses (implants). */
const IMPLANT_ATTRIBUTE_IDS: Readonly<Record<number, AttributeName>> = {
  175: 'charisma',
  176: 'intelligence',
  177: 'memory',
  178: 'perception',
  179: 'willpower',
};

/** [requiredSkillN typeID attribute, requiredSkillNLevel attribute] pairs, N = 1..6. */
const REQUIRED_SKILL_ATTRIBUTE_PAIRS: readonly (readonly [number, number])[] = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
];

/**
 * Extract this type's implant attribute bonuses (typically an implant, but
 * harmless to call on anything). Zero-value attributes are dropped: ESI
 * returns every attribute-bonus row per implant type, most of them 0.
 */
export function extractAttributeBonuses(
  dogmaAttributes: readonly DogmaAttribute[] | undefined
): Partial<Attributes> {
  const bonuses: Partial<Attributes> = {};
  if (!dogmaAttributes) return bonuses;
  for (const { attribute_id, value } of dogmaAttributes) {
    const name = IMPLANT_ATTRIBUTE_IDS[attribute_id];
    if (name && value !== 0) bonuses[name] = value;
  }
  return bonuses;
}

/** Sum non-zero per-attribute bonuses across multiple implants into one Implants map. */
export function sumAttributeBonuses(bonusSets: readonly Partial<Attributes>[]): Implants {
  const total: Implants = {};
  for (const bonuses of bonusSets) {
    for (const [name, value] of Object.entries(bonuses) as [AttributeName, number][]) {
      if (!value) continue;
      total[name] = (total[name] ?? 0) + value;
    }
  }
  return total;
}

export interface RequiredSkill {
  skillTypeID: number;
  level: number;
}

/**
 * Extract "this item requires skill X at level Y" pairs from a type's dogma
 * attributes. ESI values are floats (e.g. `3329.0`) — rounded to ints. A
 * requiredSkillN of 0/absent (most items only use the first 1-3 of 6 slots)
 * is skipped rather than emitted as `skillTypeID: 0`.
 */
export function extractRequiredSkills(
  dogmaAttributes: readonly DogmaAttribute[] | undefined
): RequiredSkill[] {
  if (!dogmaAttributes) return [];
  const byAttributeId = new Map<number, number>();
  for (const { attribute_id, value } of dogmaAttributes) byAttributeId.set(attribute_id, value);

  const required: RequiredSkill[] = [];
  for (const [skillAttrId, levelAttrId] of REQUIRED_SKILL_ATTRIBUTE_PAIRS) {
    const skillTypeID = byAttributeId.get(skillAttrId);
    const level = byAttributeId.get(levelAttrId);
    if (!skillTypeID) continue;
    required.push({ skillTypeID: Math.round(skillTypeID), level: Math.round(level ?? 0) });
  }
  return required;
}
