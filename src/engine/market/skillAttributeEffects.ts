/**
 * Which skill modifies a specific item attribute value, and by how much.
 * `SkillAttributeModifierMap` names only which skill *could* modify an
 * attribute (`scripts/build-sde.mjs`); this narrows that to the skills that
 * actually apply to one item (its own required skills gate applicability)
 * and computes the PostPercent magnitude at a trained level. Pure.
 */
import type { SkillAttributeModifier, SkillAttributeModifierMap } from '@/sde/types';

export interface ModifyingSkillEffect {
  ownerSkillTypeID: number;
  perLevelValue: number;
}

/**
 * Skills that modify `attributeId` on an item requiring `itemRequiredSkillTypeIds`
 * (a candidate applies only when the item requires its `gatingSkillTypeID` —
 * see `SkillAttributeModifier`). De-duplicates by owning skill.
 */
export function findModifyingSkills(
  attributeId: number,
  itemRequiredSkillTypeIds: ReadonlySet<number>,
  index: SkillAttributeModifierMap
): ModifyingSkillEffect[] {
  const candidates: readonly SkillAttributeModifier[] = index[attributeId] ?? [];
  const seen = new Set<number>();
  const result: ModifyingSkillEffect[] = [];
  for (const candidate of candidates) {
    if (!itemRequiredSkillTypeIds.has(candidate.gatingSkillTypeID)) continue;
    if (seen.has(candidate.ownerSkillTypeID)) continue;
    seen.add(candidate.ownerSkillTypeID);
    result.push({
      ownerSkillTypeID: candidate.ownerSkillTypeID,
      perLevelValue: candidate.perLevelValue,
    });
  }
  return result;
}

/** A PostPercent bonus's total magnitude at a trained level. Zero at level 0. */
export function postPercentMagnitude(perLevelValue: number, trainedLevel: number): number {
  return perLevelValue * trainedLevel;
}

export interface NextLevelValue {
  level: number;
  value: number;
}

/**
 * What `current` (the figure as shown, with the skill at `trainedLevel`) reads
 * once the skill reaches each of the next `count` levels, capped at V. A
 * PostPercent bonus multiplies the attribute by `1 + perLevelValue% × level`,
 * so a level's value is `current` scaled by that factor's change.
 */
export function nextLevelValues(
  current: number,
  perLevelValue: number,
  trainedLevel: number,
  count: number
): NextLevelValue[] {
  const factor = (level: number) => 1 + (perLevelValue * level) / 100;
  const result: NextLevelValue[] = [];
  for (let level = trainedLevel + 1; level <= Math.min(5, trainedLevel + count); level++) {
    result.push({ level, value: (current * factor(level)) / factor(trainedLevel) });
  }
  return result;
}
