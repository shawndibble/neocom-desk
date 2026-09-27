/**
 * The one feature-side place that gathers a Character's snapshot — corrected
 * trained skills plus active-clone implants — and turns it into Character
 * Modifiers (issue #1284). Every pricing surface loads through this, so a new
 * bonus lands once in `src/engine/industry/characterModifiers.ts` and reaches
 * all of them.
 */
import { useEffect, useState } from 'react';
import { characterModifiers, type CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { SkillLevels } from '@/engine/industry/types';
import {
  loadCorrectedSkills,
  type LoadCorrectedSkillsOptions,
} from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export interface LoadCharacterModifiersOptions extends LoadCorrectedSkillsOptions {
  /**
   * `'effective'` = min(trained, active), issue #1236's rule — what Industry
   * uses. `'trained'` (default) = queue-corrected trained level, what the
   * market/refining surfaces have always read.
   */
  levels?: 'trained' | 'effective';
}

export async function loadCharacterModifiers(
  characterId: number,
  nowMs: number,
  { levels = 'trained', ...options }: LoadCharacterModifiersOptions = {}
): Promise<CharacterModifiers> {
  const [corrected, implants] = await Promise.all([
    loadCorrectedSkills(characterId, nowMs, options),
    loadCharacterImplants(characterId),
  ]);
  // /skills lags until the character logs in; completed queue entries are
  // the difference, which `loadCorrectedSkills` already folds in.
  const skills: SkillLevels = {};
  if (levels === 'effective') {
    for (const [skillId, level] of corrected.effective) skills[skillId] = level;
  } else {
    for (const [skillId, trained] of corrected.trained) skills[skillId] = trained.level;
  }
  return characterModifiers({ skills, implantTypeIds: implants?.data ?? [] });
}

/**
 * Every given Character's `CharacterModifiers`, fanned out and cached — for
 * Build Opportunities (issue #2055), which prices each candidate against its
 * own owning Character's real skills/implants rather than one active
 * Character's. A Character absent from the result had no resolved modifiers
 * yet; callers should read that the same way a not-yet-hydrated Character
 * reads elsewhere — as `NO_CHARACTER_MODIFIERS` (import from
 * `@/engine/industry/characterModifiers`).
 *
 * Mirrors `useAccountSkillLevels`'s value-stable-key shape: `key` is the id
 * set's real identity (order-independent), so an upstream caller that rebuilds
 * its id array on every render does not restart this fan-out.
 */
export function useCharacterModifiersByCharacter(
  characterIds: readonly number[],
  options?: LoadCharacterModifiersOptions
): ReadonlyMap<number, CharacterModifiers> {
  const [modifiersByCharacter, setModifiersByCharacter] = useState<
    ReadonlyMap<number, CharacterModifiers>
  >(new Map());
  const key = [...characterIds].sort((a, b) => a - b).join(',');

  useEffect(() => {
    let cancelled = false;
    const byCharacter = new Map<number, CharacterModifiers>();
    void mapWithConcurrencyLimit(characterIds, ESI_FANOUT_CONCURRENCY, async (characterId) => {
      byCharacter.set(characterId, await loadCharacterModifiers(characterId, Date.now(), options));
    }).then(() => {
      if (!cancelled) setModifiersByCharacter(byCharacter);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the id set's real identity; `characterIds`/`options` are intentionally not deps (see the comment above `key`).
  }, [key]);

  return modifiersByCharacter;
}
