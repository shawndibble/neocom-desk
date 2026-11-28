import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { usePublicInfo } from '@/stores/publicInfo';

export function useCharacterIdentity(characterId: number) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const publicInfo = usePublicInfo((state) => state.byCharacterId[characterId]);
  const loadPublicInfo = usePublicInfo((state) => state.load);

  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  return { name: character?.name, publicInfo };
}
