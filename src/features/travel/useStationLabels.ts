/**
 * The names of the stations a Route Safety link tags its stops with (issue
 * #4964). The link carries ids only. An NPC station's name is a snapshot read;
 * a structure's is the Character's own ACL-checked lookup, so a structure the
 * pilot cannot see stays unnamed — the stop then shows its system, never a
 * guessed name. A station picked this session is `remember`ed, so its label is
 * there on the same render the stop is.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadVisibleStructure } from '@/features/character/structures';
import { lookupNpcStation } from '@/sde/npcStations';
import { useActiveCharacter } from '@/stores/activeCharacter';

async function stationName(characterId: number | null, id: number): Promise<string | null> {
  const station = await lookupNpcStation(id);
  if (station) return station.name;
  if (station === undefined || characterId === null) return null;
  const visible = await loadVisibleStructure(characterId, id).catch(() => null);
  return visible?.name ?? null;
}

const EMPTY: ReadonlyMap<number, string> = new Map();

export function useStationLabels(stationIds: readonly number[]): {
  labels: ReadonlyMap<number, string>;
  remember: (id: number, name: string) => void;
} {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const [named, setNamed] = useState<{
    characterId: number | null;
    labels: ReadonlyMap<number, string>;
  }>({
    characterId,
    labels: new Map(),
  });
  // A name resolved under another Character is that Character's to see.
  const labels = named.characterId === characterId ? named.labels : EMPTY;
  const key = stationIds.join(',');
  useEffect(() => {
    const wanted = key === '' ? [] : key.split(',').map(Number);
    let cancelled = false;
    void Promise.all(
      wanted
        .filter((id) => !labels.has(id))
        .map(async (id) => [id, await stationName(characterId, id)] as const)
    ).then((found) => {
      const pairs = found.filter((pair): pair is readonly [number, string] => pair[1] !== null);
      if (cancelled || pairs.length === 0) return;
      setNamed((prev) => ({
        characterId,
        labels: new Map([...(prev.characterId === characterId ? prev.labels : []), ...pairs]),
      }));
    });
    return () => {
      cancelled = true;
    };
    // `labels` is read only to skip ids already named; a new name must not restart the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, characterId]);
  const remember = useCallback(
    (id: number, name: string) =>
      setNamed((prev) => ({
        characterId,
        labels: new Map([...(prev.characterId === characterId ? prev.labels : []), [id, name]]),
      })),
    [characterId]
  );
  return { labels, remember };
}
