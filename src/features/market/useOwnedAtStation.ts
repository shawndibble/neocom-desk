/**
 * Stock every Character holds at one place (station or structure), for the
 * Appraisal's "Minus owned", plus the places that hold stock for its picker.
 * Cache-first via `loadAllCharactersAssets`; idle (null) when off.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ownedAnywhere,
  ownedAtPlace,
  ownedPlaces,
  type OwnedPlace,
} from '@/engine/market/appraisalOwned';
import { loadAllCharactersAssets } from '@/features/assets/assets';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';

export interface OwnedAtStation {
  /** Null while off, loading, or when nothing could be read. */
  owned: ReadonlyMap<number, number> | null;
  loading: boolean;
  /** Stations and structures that hold counted stock; empty until read. */
  places: readonly OwnedPlace[];
  /** Resolved place names by id; an unreadable structure has none. */
  placeNames: ReadonlyMap<number, string>;
}

/** One place's stock (station or structure id), or `'all'` for everything held anywhere. */
export type OwnedScope = number | 'all';

type AssetLists = Parameters<typeof ownedAnywhere>[0];

const NO_PLACES: readonly OwnedPlace[] = [];
const NO_NAMES: ReadonlyMap<number, string> = new Map();

export function useOwnedAtStation(enabled: boolean, scope: OwnedScope): OwnedAtStation {
  const [lists, setLists] = useState<AssetLists | null>(null);
  const [names, setNames] = useState<ReadonlyMap<number, string>>(NO_NAMES);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadAllCharactersAssets()
      .then(async ({ entries }) => {
        if (cancelled) return;
        const loaded = entries.map((entry) => entry.assets);
        setLists(loaded);
        const characterId = entries[0]?.characterId;
        const resolved = new Map<number, string>();
        await Promise.all(
          ownedPlaces(loaded).map(async (place) => {
            const name =
              place.kind === 'station'
                ? await loadStationName(place.id)
                : characterId === undefined
                  ? null
                  : await loadStructureName(characterId, place.id);
            if (name) resolved.set(place.id, name);
          })
        );
        if (!cancelled) setNames(resolved);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const owned = useMemo(() => {
    if (!lists) return null;
    return scope === 'all' ? ownedAnywhere(lists) : ownedAtPlace(lists, scope);
  }, [lists, scope]);
  const places = useMemo(() => (lists ? ownedPlaces(lists) : NO_PLACES), [lists]);

  const ready = enabled && owned !== null;
  return {
    owned: ready ? owned : null,
    loading: enabled && !ready,
    places,
    placeNames: names,
  };
}
