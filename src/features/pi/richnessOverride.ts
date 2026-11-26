import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PlanetRichnessRecord } from '@/db';
import type { RichnessByPlanet } from './effectiveResources';

export { effectiveLocalResources, type RichnessByPlanet } from './effectiveResources';

export function usePlanetRichness(characterId: number | null): RichnessByPlanet | null {
  const rows = useLiveQuery(
    async (): Promise<PlanetRichnessRecord[]> =>
      characterId === null
        ? []
        : db.planetRichness.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  return useMemo(
    () => (rows === undefined ? null : new Map(rows.map((row) => [row.planetId, row.order]))),
    [rows]
  );
}
