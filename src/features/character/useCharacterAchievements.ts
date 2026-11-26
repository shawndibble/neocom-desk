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
const loadTitles = () => loadCharacterTitles();

function useTitleNames(needed: boolean): Readonly<Record<string, string>> | null {
  const titles = useKeyedLoad(needed ? 'characterTitles' : null, loadTitles);
  return titles.status === 'ready' ? titles.data : null;
}

export interface AchievementLookup {
  partsOf: (characterId: number) => AchievementParts | null | undefined;
  scoreOf: (characterId: number) => number | undefined;
}

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

export function useAchievementParts(achievement: CharacterAchievement): AchievementParts | null {
  const titleNames = useTitleNames(achievement.titleId !== null);
  return achievementParts(achievement, titleNames);
}
