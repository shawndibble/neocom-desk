import { useEffect, useRef, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { searchKnownPlaces, type KnownPlace } from './placeSearch';

const MIN_PLACE_QUERY = 2;

export type FoundPlace = KnownPlace & { systemId: number };

export function useKnownPlaces(query: string, enabled: boolean, limit: number): FoundPlace[] {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const trimmed = query.trim();
  const [found, setFound] = useState<{
    query: string;
    characterId: number | null;
    places: FoundPlace[];
  }>({ query: '', characterId: null, places: [] });
  const latest = useRef(0);
  useEffect(() => {
    if (!enabled || trimmed.length < MIN_PLACE_QUERY) return;
    const ticket = ++latest.current;
    void searchKnownPlaces(characterId, trimmed, limit)
      .then((places) => {
        if (ticket === latest.current) setFound({ query: trimmed, characterId, places });
      })
      .catch(() => {});
  }, [enabled, characterId, trimmed, limit]);
  return enabled && found.query === trimmed && found.characterId === characterId
    ? found.places
    : [];
}
