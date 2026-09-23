/**
 * Which skill modifies a specific item attribute value, and by how much
 * (issue #1372's "click Falloff, see which skill changes it" popover).
 * `SkillAttributeModifierMap` names only which skill *could* modify an
 * attribute (`scripts/build-sde.mjs`); this narrows that to the skills that
 * actually apply to one item (its own required skills gate applicability)
 * and computes the PostPercent magnitude at a trained level. Pure — callers
 * supply the item's required skills and the trained level.
 */
import type { SkillAttributeModifier, SkillAttributeModifierMap } from '@/sde/types';

export interface ModifyingSkillEffect {
  ownerSkillTypeID: number;
  /** Attribute on `ownerSkillTypeID`'s own dogma_attributes holding the per-level base value. */
  sourceAttributeID: number;
}

/**
 * Skills that modify `attributeId` on an item requiring `itemRequiredSkillTypeIds`.
 * A candidate applies only when the item requires its `gatingSkillTypeID` —
 * Sharpshooter's bonus to Optimal Range, for instance, only applies to items
 * requiring Gunnery, even though Sharpshooter itself isn't required by them.
 * De-duplicates by owning skill: the same skill is never listed twice for one
 * attribute even if more than one gating row happens to name it.
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
      sourceAttributeID: candidate.sourceAttributeID,
    });
  }
  return result;
}

/**
 * A PostPercent bonus's total magnitude at a trained level: the flat
 * per-level design value (e.g. Sharpshooter's own attribute 294 = 5, "5% per
 * level") times the trained level. Zero at level 0 (untrained).
 */
export function postPercentMagnitude(perLevelValue: number, trainedLevel: number): number {
  return perLevelValue * trainedLevel;
}
