import { useMemo } from 'react';
import { idSetKey } from '@/lib/idSetKey';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useBatchedMap } from '@/lib/useBatchedMap';
import { loadCharacterTitles } from '@/sde/loadSde';
import {
  achievementParts,
  loadCharacterAchievement,
  type AchievementParts,
  type CharacterAchievement,
} from './achievement';

const loadEntry = (entry: string) => loadCharacterAchievement(Number(entry));
// Read at call time: a test's @/sde/loadSde mock without this export throws on access.
const loadTitles = () => loadCharacterTitles();

/** The baked `characterTitles` table, read only once a title is on screen. */
function useTitleNames(needed: boolean): Readonly<Record<string, string>> | null {
  const titles = useKeyedLoad(needed ? 'characterTitles' : null, loadTitles);
  return titles.status === 'ready' ? titles.data : null;
}

export interface AchievementLookup {
  /** Undefined until loaded; null when there is nothing to show. */
  partsOf: (characterId: number) => AchievementParts | null | undefined;
  scoreOf: (characterId: number) => number | undefined;
}

/**
 * Each Character's score and title (issue #4777), a few public records at a
 * time. With `enabled` false nothing is read: Contacts reads only while its
 * column shows.
 */
export function useCharacterAchievements(
  characterIds: readonly number[],
  enabled = true
): AchievementLookup {
  const { values } = useBatchedMap(enabled ? idSetKey(characterIds) : '', loadEntry);
  const titleNames = useTitleNames(
    useMemo(() => [...values.values()].some((achievement) => achievement?.titleId), [values])
  );
  return useMemo(
    () => ({
      partsOf: (characterId) => {
        const entry = String(characterId);
        if (!values.has(entry)) return undefined;
        const achievement = values.get(entry);
        return achievement ? achievementParts(achievement, titleNames) : null;
      },
      scoreOf: (characterId) => values.get(String(characterId))?.score,
    }),
    [values, titleNames]
  );
}

/** An already-read score and title (Show info's profile), with the title named. */
export function useAchievementParts(achievement: CharacterAchievement): AchievementParts | null {
  const titleNames = useTitleNames(achievement.titleId !== null);
  return achievementParts(achievement, titleNames);
}
