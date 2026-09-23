import { describe, expect, it } from 'vitest';
import { findModifyingSkills, postPercentMagnitude } from './skillAttributeEffects';
import type { SkillAttributeModifierMap } from '@/sde/types';

// Real traced example (design doc, verified against a live dump 2026-09):
// Sharpshooter (3311) grants a PostPercent bonus to attribute 54 (Optimal
// Range) on items requiring Gunnery (3300), sourced from its own attribute
// 294. Gunnery (3300) itself grants a PostPercent bonus to attribute 51
// (Rate of Fire) on items it gates, sourced from its own attribute 441.
const INDEX: SkillAttributeModifierMap = {
  '54': [{ ownerSkillTypeID: 3311, gatingSkillTypeID: 3300, sourceAttributeID: 294 }],
  '51': [{ ownerSkillTypeID: 3300, gatingSkillTypeID: 3300, sourceAttributeID: 441 }],
};

describe('findModifyingSkills', () => {
  it('finds a skill that modifies the attribute when the item requires the gating skill', () => {
    const result = findModifyingSkills(54, new Set([3300, 3301]), INDEX);
    expect(result).toEqual([{ ownerSkillTypeID: 3311, sourceAttributeID: 294 }]);
  });

  it('finds nothing when the item does not require the gating skill', () => {
    // A missile launcher never requires Gunnery, so Sharpshooter's bonus
    // to attribute 54 never applies to it even if the launcher happened to
    // carry that attribute for an unrelated reason.
    const result = findModifyingSkills(54, new Set([3319]), INDEX);
    expect(result).toEqual([]);
  });

  it('finds nothing for an attribute with no modifiers in the index', () => {
    expect(findModifyingSkills(9, new Set([3300]), INDEX)).toEqual([]);
  });

  it('finds nothing when the item requires no skills at all', () => {
    expect(findModifyingSkills(54, new Set(), INDEX)).toEqual([]);
  });

  it('a skill can gate its own bonus (Gunnery boosting Gunnery-gated items)', () => {
    const result = findModifyingSkills(51, new Set([3300]), INDEX);
    expect(result).toEqual([{ ownerSkillTypeID: 3300, sourceAttributeID: 441 }]);
  });
});

describe('postPercentMagnitude', () => {
  it('multiplies the per-level base value by the trained level', () => {
    // Sharpshooter: 5% per level, trained to II -> +10% total.
    expect(postPercentMagnitude(5, 2)).toBe(10);
  });

  it('is zero at an untrained level', () => {
    expect(postPercentMagnitude(5, 0)).toBe(0);
  });
});
