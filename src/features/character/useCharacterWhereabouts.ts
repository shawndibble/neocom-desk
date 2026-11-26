import { useMemo } from 'react';
import { useCharacterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { idSetKey } from '@/lib/idSetKey';
import { useBatchedMap } from '@/lib/useBatchedMap';
import {
  LOCATION_SCOPE,
  SHIP_SCOPE,
  loadCharacterWhereabouts,
  type CharacterWhereabouts,
} from './characterWhereabouts';

export interface WhereaboutsLookup {
  of: (characterId: number) => CharacterWhereabouts | undefined;
  hasLocationGrant: (characterId: number) => boolean;
  hasShipGrant: (characterId: number) => boolean;
}

export function useCharacterWhereabouts(characterIds: readonly number[]): WhereaboutsLookup {
  const withLocation = useCharacterIdsWithScopes([LOCATION_SCOPE], characterIds);
  const withShip = useCharacterIdsWithScopes([SHIP_SCOPE], characterIds);
  const ready = withLocation !== undefined && withShip !== undefined;
  const locationKey = withLocation ? idSetKey(withLocation) : '';
  const shipKey = withShip ? idSetKey(withShip) : '';
  const load = useMemo(() => {
    const location = new Set(locationKey.split(',').map(Number));
    const ship = new Set(shipKey.split(',').map(Number));
    return (entry: string) => {
      const id = Number(entry);
      return loadCharacterWhereabouts(id, { location: location.has(id), ship: ship.has(id) });
    };
  }, [locationKey, shipKey]);
  const { values } = useBatchedMap(ready ? idSetKey(characterIds) : '', load);
  return useMemo(
    () => ({
      of: (characterId) => values.get(String(characterId)),
      hasLocationGrant: (characterId) => withLocation?.has(characterId) ?? true,
      hasShipGrant: (characterId) => withShip?.has(characterId) ?? true,
    }),
    [values, withLocation, withShip]
  );
}
