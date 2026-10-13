import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * Whether the active Character has logged any Production Run. The Logs tab
 * and its nav entries only show once it has: before that the page is an empty
 * state with nothing to act on. `false` while the read is pending, so the
 * entry appears a beat late rather than flickering in and out.
 */
export function useHasProductionLogs(): boolean {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  return useLiveQuery(
    async () =>
      characterId === null
        ? false
        : (await db.productionRuns.where('characterId').equals(characterId).count()) > 0,
    [characterId],
    false
  );
}
