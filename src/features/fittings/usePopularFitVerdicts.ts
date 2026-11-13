/**
 * Each Popular fits row's can-fly verdict (#6011), from the editor chip's own
 * sources, with requirements read once per set of types. `null` with no
 * Character, while loading, or when skills can't be read: no verdict beats a guess.
 */
import { useCallback, useMemo } from 'react';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { fitSkillVerdict, type FitSkillVerdict } from '@/engine/fittings/fitSkillVerdict';
import type { EngineSkill } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadActivePilotProfileState } from './fittingPilotProfile';
import { shipTreeSkillCatalog } from './shipTree/shipTreeCatalogs';
import { loadRequirementsForTypes } from './skillRequirements';

/** One listed fit: its row key, and its `fittingRequirementTypeIds`. */
export interface VerdictFit {
  key: string;
  typeIds: readonly number[];
}

/** What the verdicts are read from; tests pass stand-ins. */
export interface FitVerdictSources {
  /** The Character's Effective Skill Levels; rejects when they couldn't be read. */
  skillLevels: (characterId: number) => Promise<ReadonlyMap<number, number>>;
  /** Each readable type's required skills; a type left out is unknown. */
  requirements: (
    typeIds: readonly number[]
  ) => Promise<ReadonlyMap<number, readonly RequiredSkill[]>>;
  /** Skills by type id, for names and the Alpha cap. */
  skills: () => Promise<ReadonlyMap<number, Pick<EngineSkill, 'alphaMaxLevel' | 'name'>>>;
}

export const fitVerdictSources: FitVerdictSources = {
  skillLevels: async (characterId) => {
    const { profile, skillsKnown } = await loadActivePilotProfileState(characterId);
    // An empty skill sheet would make every fit read "Missing N skills".
    if (!skillsKnown) throw new Error('skills unknown');
    return profile.skillLevels;
  },
  requirements: async (typeIds) => (await loadRequirementsForTypes(typeIds)).byType,
  skills: async () => (await shipTreeSkillCatalog()).engineSkills,
};

export function usePopularFitVerdicts(
  fits: readonly VerdictFit[] | null,
  sources: FitVerdictSources
): ReadonlyMap<string, FitSkillVerdict> | null {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const cloneStates = useCloneStates((state) => state.value);
  useHydratedStore(useCloneStates);

  // Keyed on the types, not the list: a row's price or badge landing makes a
  // new list with the same fits, which must not read everything again.
  const typeKey = useMemo(
    () =>
      fits === null
        ? ''
        : [...new Set(fits.flatMap((fit) => fit.typeIds))].sort((a, b) => a - b).join(','),
    [fits]
  );
  const typeIds = useMemo(() => (typeKey === '' ? [] : typeKey.split(',').map(Number)), [typeKey]);
  const key = characterId === null || typeKey === '' ? null : `${characterId}:${typeKey}`;
  const loader = useCallback(async () => {
    if (characterId === null) throw new Error('no Character');
    const [skillLevels, requirementsByType, skills] = await Promise.all([
      sources.skillLevels(characterId),
      sources.requirements(typeIds),
      sources.skills(),
    ]);
    return { skillLevels, requirementsByType, skills };
  }, [characterId, typeIds, sources]);
  const loaded = useKeyedLoad(key, loader).data;

  return useMemo(() => {
    if (fits === null || characterId === null || loaded === undefined) return null;
    const input = { ...loaded, cloneState: cloneStateFor(cloneStates, characterId) };
    // No types: the fit wasn't read (its game data failed), not "needs nothing".
    return new Map(
      fits
        .filter((fit) => fit.typeIds.length > 0)
        .map((fit) => [fit.key, fitSkillVerdict(fit.typeIds, input)])
    );
  }, [fits, loaded, characterId, cloneStates]);
}
