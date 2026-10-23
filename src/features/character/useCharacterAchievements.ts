import { useMemo } from 'react';
import { isNpcCharacterId } from '@/esi/entityIds';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useBatchedMap } from '@/lib/useBatchedMap';
import { loadCharacterTitles } from '@/sde/loadSde';
import { loadCharacterAchievement, type CharacterAchievement } from './achievement';

const loadEntry = (entry: string) => loadCharacterAchievement(Number(entry));
// Read through a wrapper so the table's loader is only touched once a title shows.
const loadTitles = () => loadCharacterTitles();

const NO_IDS: readonly number[] = [];

/**
 * Each Character's achievement score and title (issue #4777), a few public
 * records at a time. NPC agents are left out (they have neither), and with
 * `enabled` false nothing is read: Contacts reads only while its column shows.
 * A Character absent from the map has not loaded; null is a record that
 * could not be read.
 */
export function useCharacterAchievements(
  characterIds: readonly number[],
  enabled = true
): ReadonlyMap<number, CharacterAchievement | null> {
  const ids = enabled ? characterIds : NO_IDS;
  const key = useMemo(
    () => [...new Set(ids.filter((id) => !isNpcCharacterId(id)))].sort((a, b) => a - b).join(','),
    [ids]
  );
  const { values } = useBatchedMap(key, loadEntry);
  return useMemo(
    () => new Map([...values].map(([entry, achievement]) => [Number(entry), achievement])),
    [values]
  );
}

/** One Character's, for a card or header; null until loaded or when there is none. */
export function useCharacterAchievement(
  characterId: number | undefined
): CharacterAchievement | null {
  const ids = useMemo(() => (characterId === undefined ? NO_IDS : [characterId]), [characterId]);
  const achievements = useCharacterAchievements(ids);
  return characterId === undefined ? null : (achievements.get(characterId) ?? null);
}

/**
 * The baked `characterTitles` table, read only once some Character on screen
 * shows a title (`needed`); null until then (a title shows as none meanwhile).
 */
export function useCharacterTitleNames(needed: boolean): Readonly<Record<string, string>> | null {
  const titles = useKeyedLoad(needed ? 'characterTitles' : null, loadTitles);
  return titles.status === 'ready' ? titles.data : null;
}
