import type { SkillAttributeModifier, SkillAttributeModifierMap } from '@/sde/types';

export interface ModifyingSkillEffect {
  ownerSkillTypeID: number;
  perLevelValue: number;
}

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

export function postPercentMagnitude(perLevelValue: number, trainedLevel: number): number {
  return perLevelValue * trainedLevel;
}

export interface NextLevelValue {
  level: number;
  value: number;
}

export function nextLevelValues(
  current: number,
  perLevelValue: number,
  trainedLevel: number,
  count: number,
  shownLevel = trainedLevel
): NextLevelValue[] {
  const factor = (level: number) => 1 + (perLevelValue * level) / 100;
  const shown = factor(shownLevel);
  if (shown === 0) return [];
  const result: NextLevelValue[] = [];
  for (let level = trainedLevel + 1; level <= Math.min(5, trainedLevel + count); level++) {
    result.push({ level, value: (current * factor(level)) / shown });
  }
  return result;
}
