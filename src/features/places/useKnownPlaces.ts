/**
 * The stations and known structures matching a typed query, for a search box
 * that mixes them with systems (issue #4964). Local reads only — see
 * `searchKnownPlaces` — so it runs on each keystroke with no debounce. Hits
 * for an older query are never returned: an empty list, not stale rows.
 */
import { useEffect, useRef, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { searchKnownPlaces, type KnownPlace } from './placeSearch';

/** A station is rarely a one-letter search, and each keystroke ranks the whole snapshot. */
const MIN_PLACE_QUERY = 2;

export type FoundPlace = KnownPlace & { systemId: number };

export function useKnownPlaces(query: string, enabled: boolean, limit: number): FoundPlace[] {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const trimmed = query.trim();
  const [found, setFound] = useState<{ query: string; places: FoundPlace[] }>({
    query: '',
    places: [],
  });
  const latest = useRef(0);
  useEffect(() => {
    if (!enabled || trimmed.length < MIN_PLACE_QUERY) return;
    const ticket = ++latest.current;
    void searchKnownPlaces(characterId, trimmed, limit)
      .then((places) => {
        if (ticket === latest.current) setFound({ query: trimmed, places });
      })
      .catch(() => {
        // A failed local read leaves the systems alone; the box is never worse than before.
      });
  }, [enabled, characterId, trimmed, limit]);
  return enabled && found.query === trimmed ? found.places : [];
}
