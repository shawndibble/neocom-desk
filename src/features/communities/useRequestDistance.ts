import { useEffect, useMemo, useState } from 'react';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { jumpsToPlace, resolvePlace } from '@/engine/communities/requestPlaces';
import { jumpDistancesFrom } from '@/engine/route/jumpRoute';
import type { EsiEndpointId } from '@/esi/registry';
import type { CurrentSystemState } from '@/features/route/currentSystem';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { usePlaceIndex } from './usePlaceIndex';

/** What knowing where the pilot is takes: the Character's location Permission. */
export const LOCATION_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterLocation'];

/** Why distance cannot be used: the Permission is missing, or the Character's location is not known. */
export type DistanceUnavailable = 'permission' | 'location';

export type RequestDistance =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: DistanceUnavailable }
  /** Where the pilot is is known; the map is read once a distance is asked for. */
  | { status: 'idle' }
  | { status: 'failed' }
  | { status: 'ready'; jumpsOf: (locationText: string) => number | null };

/**
 * Jumps from the viewer's Character to a Request's place (issue #3811). The
 * Character's current system comes from the existing location read (cached,
 * never polled); the stargate map and the system/region names are read only
 * once `wanted` (a distance was chosen), so a board nobody filters by distance
 * pays for neither. Every way of not knowing is its own state, because the
 * board must say why distance is off, never quietly ignore it.
 */
export function useRequestDistance(
  characterId: number,
  current: CurrentSystemState,
  wanted: boolean
): RequestDistance {
  const places = usePlaceIndex(wanted);
  const lacksScope = useCharacterLacksEndpoints(characterId, LOCATION_ENDPOINTS);
  const [map, setMap] = useState<
    | { characterId: number; systemId: number; failed: true }
    | {
        characterId: number;
        systemId: number;
        failed: false;
        distances: ReadonlyMap<number, number>;
      }
    | null
  >(null);

  // Where to measure from: the pilot's pick, else the game's location (the
  // shared Current System, as every Jump Range filter reads it).
  const systemId = current.loaded ? current.systemId : undefined;

  useEffect(() => {
    if (!wanted || systemId === undefined || systemId === null) return;
    let cancelled = false;
    loadJumpGraph()
      .then((graph) => {
        if (cancelled) return;
        if (!graph) {
          setMap({ characterId, systemId, failed: true });
          return;
        }
        setMap({
          characterId,
          systemId,
          failed: false,
          distances: jumpDistancesFrom(graph, systemId),
        });
      })
      .catch(() => !cancelled && setMap({ characterId, systemId, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [wanted, characterId, systemId]);

  const ready = map?.characterId === characterId && map.systemId === systemId ? map : null;
  return useMemo<RequestDistance>(() => {
    if (systemId === undefined) return { status: 'loading' };
    if (systemId === null) {
      return { status: 'unavailable', reason: lacksScope ? 'permission' : 'location' };
    }
    if (!wanted) return { status: 'idle' };
    if (!ready) return { status: 'loading' };
    if (ready.failed || places.status === 'failed') return { status: 'failed' };
    if (places.status === 'loading') return { status: 'loading' };
    const { distances } = ready;
    const { index } = places;
    return {
      status: 'ready',
      jumpsOf: (text) => {
        const place = resolvePlace(text, index);
        return place ? jumpsToPlace(place, distances, index) : null;
      },
    };
  }, [lacksScope, systemId, wanted, ready, places]);
}
