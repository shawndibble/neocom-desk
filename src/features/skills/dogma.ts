import type { AttributeName, Attributes, Implants } from '@/engine/types';
import type { DogmaAttribute } from '@/esi/endpoints';
import { SKILL_REQUIREMENT_PAIRS as REQUIRED_SKILL_ATTRIBUTE_PAIRS } from '@/engine/market/itemAttributes';

const IMPLANT_ATTRIBUTE_IDS: Readonly<Record<number, AttributeName>> = {
  175: 'charisma',
  176: 'intelligence',
  177: 'memory',
  178: 'perception',
  179: 'willpower',
};

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

const IMPLANT_SLOT_ATTRIBUTE_ID = 331;

export function extractImplantSlot(
  dogmaAttributes: readonly DogmaAttribute[] | undefined
): number | undefined {
  const value = dogmaAttributes?.find((a) => a.attribute_id === IMPLANT_SLOT_ATTRIBUTE_ID)?.value;
  return value || undefined;
}

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
