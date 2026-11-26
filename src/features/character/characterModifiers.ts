import { idSetKey } from '@/lib/idSetKey';
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
  const skills: SkillLevels = {};
  if (levels === 'effective') {
    for (const [skillId, level] of corrected.effective) skills[skillId] = level;
  } else {
    for (const [skillId, trained] of corrected.trained) skills[skillId] = trained.level;
  }
  return characterModifiers({ skills, implantTypeIds: implants?.data ?? [] });
}

export function useCharacterModifiersByCharacter(
  characterIds: readonly number[],
  options?: LoadCharacterModifiersOptions
): ReadonlyMap<number, CharacterModifiers> {
  const [modifiersByCharacter, setModifiersByCharacter] = useState<
    ReadonlyMap<number, CharacterModifiers>
  >(new Map());
  const key = idSetKey(characterIds);

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
