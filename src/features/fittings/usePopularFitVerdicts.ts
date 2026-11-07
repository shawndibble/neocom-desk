/**
 * Each Popular fit's can-fly verdict for the active Character (issue #6011),
 * from the same sources the editor's Missing skills chip reads once a fit is
 * opened: the Character's Effective Skill Levels (`loadActivePilotProfile`)
 * and each type's required skills (`loadRequirementsForTypes`, cached per
 * type). Requirements are read once for every type across the list, and the
 * verdicts are worked out once per list, not per render.
 *
 * `null` with no Character, while loading, or when the pilot's skills can't
 * be read: rows then show no verdict rather than a guess.
 */
import { useEffect, useMemo, useState } from 'react';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { fitSkillVerdict, type FitSkillVerdict } from '@/engine/fittings/fitSkillVerdict';
import type { EngineSkill } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { loadSkills } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useReconnectCount } from '@/stores/network';
import { loadActivePilotProfileState } from './fittingPilotProfile';
import { loadRequirementsForTypes } from './skillRequirements';

/** One listed fit: its row key, and every type that gates flying it (`fittingRequirementTypeIds`). */
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
  /** Skills by type id, for the Alpha cap. */
  skills: () => Promise<ReadonlyMap<number, Pick<EngineSkill, 'alphaMaxLevel'>>>;
}

export const fitVerdictSources: FitVerdictSources = {
  skillLevels: async (characterId) => {
    const { profile, skillsKnown } = await loadActivePilotProfileState(characterId);
    // An empty skill sheet would make every fit read "Missing N skills".
    if (!skillsKnown) throw new Error('skills unknown');
    return profile.skillLevels;
  },
  requirements: async (typeIds) => (await loadRequirementsForTypes(typeIds)).byType,
  skills: async () => new Map((await loadSkills()).map((skill) => [skill.typeID, skill])),
};

interface Loaded {
  characterId: number;
  typeKey: string;
  skillLevels: ReadonlyMap<number, number>;
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>;
  skills: ReadonlyMap<number, Pick<EngineSkill, 'alphaMaxLevel'>>;
}

export function usePopularFitVerdicts(
  fits: readonly VerdictFit[] | null,
  sources: FitVerdictSources
): ReadonlyMap<string, FitSkillVerdict> | null {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const cloneStates = useCloneStates((state) => state.value);
  useHydratedStore(useCloneStates);
  // Requirements a type couldn't be read for are looked up again on reconnect.
  const reconnects = useReconnectCount();

  // Keyed on the types, not the list: a row's price or badge landing makes a
  // new list with the same fits, which must not read everything again.
  const typeKey = useMemo(
    () =>
      fits === null
        ? null
        : [...new Set(fits.flatMap((fit) => fit.typeIds))].sort((a, b) => a - b).join(','),
    [fits]
  );

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (characterId === null || !typeKey) return;
    let cancelled = false;
    void Promise.all([
      sources.skillLevels(characterId),
      sources.requirements(typeKey.split(',').map(Number)),
      sources.skills(),
    ]).then(
      ([skillLevels, requirementsByType, skills]) => {
        if (!cancelled)
          setLoaded({ characterId, typeKey, skillLevels, requirementsByType, skills });
      },
      () => {
        // No verdicts: the rows still open, and the editor checks once a fit is open.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, typeKey, sources, reconnects]);

  return useMemo(() => {
    if (
      fits === null ||
      loaded === null ||
      loaded.characterId !== characterId ||
      loaded.typeKey !== typeKey
    )
      return null;
    const input = { ...loaded, cloneState: cloneStateFor(cloneStates, loaded.characterId) };
    // No types: the fit wasn't read (its game data failed), not "needs nothing".
    return new Map(
      fits
        .filter((fit) => fit.typeIds.length > 0)
        .map((fit) => [fit.key, fitSkillVerdict(fit.typeIds, input)])
    );
  }, [fits, loaded, characterId, typeKey, cloneStates]);
}
