import type { BlueprintSkillRequirement, SkillLevels } from './types';

export type { BlueprintSkillRequirement };

export interface SkillShortfall {
  typeID: number;
  haveLevel: number;
  needLevel: number;
}

export type SkillGateVerdict =
  { gated: false } | { gated: true; shortfall: readonly SkillShortfall[]; bestCharacterId: number };

function unmetRequirements(
  requirements: readonly BlueprintSkillRequirement[],
  skills: SkillLevels
): SkillShortfall[] {
  const shortfall: SkillShortfall[] = [];
  for (const req of requirements) {
    const haveLevel = skills[req.typeID] ?? 0;
    if (haveLevel < req.level)
      shortfall.push({ typeID: req.typeID, haveLevel, needLevel: req.level });
  }
  return shortfall;
}

function totalGap(shortfall: readonly SkillShortfall[]): number {
  return shortfall.reduce((sum, s) => sum + (s.needLevel - s.haveLevel), 0);
}

export function evaluateSkillGate(
  requirements: readonly BlueprintSkillRequirement[],
  accountSkills: ReadonlyMap<number, SkillLevels>
): SkillGateVerdict {
  if (requirements.length === 0 || accountSkills.size === 0) return { gated: false };

  let best: { characterId: number; shortfall: SkillShortfall[] } | null = null;
  for (const [characterId, skills] of accountSkills) {
    const shortfall = unmetRequirements(requirements, skills);
    if (shortfall.length === 0) return { gated: false };
    if (
      best === null ||
      shortfall.length < best.shortfall.length ||
      (shortfall.length === best.shortfall.length &&
        (totalGap(shortfall) < totalGap(best.shortfall) ||
          (totalGap(shortfall) === totalGap(best.shortfall) && characterId < best.characterId)))
    ) {
      best = { characterId, shortfall };
    }
  }

  if (best === null) return { gated: false };
  return { gated: true, shortfall: best.shortfall, bestCharacterId: best.characterId };
}

export function mergeSkillGates(
  verdicts: readonly (SkillGateVerdict | undefined)[]
): SkillGateVerdict {
  const byType = new Map<number, SkillShortfall>();
  let bestCharacterId: number | null = null;
  for (const verdict of verdicts) {
    if (!verdict?.gated) continue;
    bestCharacterId ??= verdict.bestCharacterId;
    for (const s of verdict.shortfall) {
      const existing = byType.get(s.typeID);
      if (!existing || s.needLevel > existing.needLevel) byType.set(s.typeID, s);
    }
  }
  if (bestCharacterId === null) return { gated: false };
  return { gated: true, shortfall: [...byType.values()], bestCharacterId };
}
