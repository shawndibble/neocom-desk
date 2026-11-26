import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

export function useActiveCorporationId(): number | null {
  return useActiveCorporationIdState() ?? null;
}

export function useActiveCorporationIdState(): number | null | undefined {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  return useLiveQuery(async () => {
    if (activeCharacterId === null) return null;
    return (await db.characters.get(activeCharacterId))?.corporationId ?? null;
  }, [activeCharacterId]);
}
