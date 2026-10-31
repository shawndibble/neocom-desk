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
  /** Undefined until read; also while the grant is still being looked up. */
  of: (characterId: number) => CharacterWhereabouts | undefined;
  /** False once the stored grant is known to lack the scope. */
  hasLocationGrant: (characterId: number) => boolean;
  hasShipGrant: (characterId: number) => boolean;
}

/** Each Character's docked place and ship, a few at a time. */
export function useCharacterWhereabouts(characterIds: readonly number[]): WhereaboutsLookup {
  const withLocation = useCharacterIdsWithScopes([LOCATION_SCOPE], characterIds);
  const withShip = useCharacterIdsWithScopes([SHIP_SCOPE], characterIds);
  const ready = withLocation !== undefined && withShip !== undefined;
  // Keyed by value: any token write re-runs the live query into a fresh Set,
  // which would otherwise reload every row from ESI.
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
      // Unknown grant reads as granted, so the hint does not flash before the lookup lands.
      hasLocationGrant: (characterId) => withLocation?.has(characterId) ?? true,
      hasShipGrant: (characterId) => withShip?.has(characterId) ?? true,
    }),
    [values, withLocation, withShip]
  );
}
