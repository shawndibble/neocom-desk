/**
 * The names of the stations a Route Safety link tags its stops with (issue
 * #4964). The link carries ids only. An NPC station's name is a snapshot read;
 * a structure's is the Character's own ACL-checked lookup, so a structure the
 * pilot cannot see stays unnamed — the stop then shows its system, never a
 * guessed name. A station picked this session is `remember`ed, so its label is
 * there on the same render the stop is.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadStructureNameNoRoster } from '@/features/character/structures';
import { lookupNpcStation } from '@/sde/npcStations';
import { useActiveCharacter } from '@/stores/activeCharacter';

async function stationName(characterId: number | null, id: number): Promise<string | null> {
  const station = await lookupNpcStation(id);
  if (station) return station.name;
  if (station === undefined || characterId === null) return null;
  return loadStructureNameNoRoster(characterId, id).catch(() => null);
}

export function useStationLabels(stationIds: readonly number[]): {
  labels: ReadonlyMap<number, string>;
  remember: (id: number, name: string) => void;
} {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const [labels, setLabels] = useState<ReadonlyMap<number, string>>(new Map());
  const key = stationIds.join(',');
  useEffect(() => {
    const wanted = key === '' ? [] : key.split(',').map(Number);
    let cancelled = false;
    void Promise.all(
      wanted
        .filter((id) => !labels.has(id))
        .map(async (id) => [id, await stationName(characterId, id)] as const)
    ).then((found) => {
      const named = found.filter((pair): pair is readonly [number, string] => pair[1] !== null);
      if (cancelled || named.length === 0) return;
      setLabels((prev) => new Map([...prev, ...named]));
    });
    return () => {
      cancelled = true;
    };
    // `labels` is read only to skip ids already named; a new name must not restart the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, characterId]);
  const remember = useCallback(
    (id: number, name: string) => setLabels((prev) => new Map(prev).set(id, name)),
    []
  );
  return { labels, remember };
}
