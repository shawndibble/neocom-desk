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
