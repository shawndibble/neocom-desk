import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

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
