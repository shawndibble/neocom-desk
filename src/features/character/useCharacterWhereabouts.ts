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

/**
 * Each Character's docked place and ship (issue #5592). With `enabled` false
 * nothing is read: the columns are off by default.
 */
export function useCharacterWhereabouts(
  characterIds: readonly number[],
  enabled: boolean
): WhereaboutsLookup {
  const withLocation = useCharacterIdsWithScopes([LOCATION_SCOPE], characterIds);
  const withShip = useCharacterIdsWithScopes([SHIP_SCOPE], characterIds);
  const ready = enabled && withLocation !== undefined && withShip !== undefined;
  const load = useMemo(
    () => (entry: string) => {
      const id = Number(entry);
      return loadCharacterWhereabouts(id, {
        location: withLocation?.has(id) ?? false,
        ship: withShip?.has(id) ?? false,
      });
    },
    [withLocation, withShip]
  );
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
