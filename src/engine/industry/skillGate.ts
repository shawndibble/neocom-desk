/**
 * Whether any character on the account can install a blueprint's job. Pure,
 * account-wide comparison — which surfaces feed it is each call site's call.
 */
import type { BlueprintSkillRequirement, SkillLevels } from './types';

export type { BlueprintSkillRequirement };

/** One requirement a character falls short on. */
export interface SkillShortfall {
  typeID: number;
  haveLevel: number;
  needLevel: number;
}

export type SkillGateVerdict =
  { gated: false } | { gated: true; shortfall: readonly SkillShortfall[]; bestCharacterId: number };

/** Every requirement a character's skill map falls short of, in requirement order. */
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

/**
 * Account-wide skill-gate verdict: not gated with no requirements, no
 * characters loaded (absent reads as unknown, never blocked), or any loaded
 * character meeting everything. Otherwise shortfall for the closest
 * character: fewest unmet, then smallest total gap, then lowest id.
 */
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

  // Unreachable when accountSkills.size > 0 — the loop above always sets
  // `best` on its first iteration — but TypeScript can't see that.
  if (best === null) return { gated: false };
  return { gated: true, shortfall: best.shortfall, bestCharacterId: best.characterId };
}

/**
 * One verdict for several builds that run together: every distinct missing
 * skill once (at the highest level any of them needs), for the first gated
 * verdict's closest character. Callers pass only the builds the plan actually
 * runs — a bought material's gate has no bearing on the plan.
 */
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
