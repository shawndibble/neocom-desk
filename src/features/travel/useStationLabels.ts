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
