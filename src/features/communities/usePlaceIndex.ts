import { useMemo } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { buildPlaceIndex, type PlaceIndex } from '@/engine/communities/requestPlaces';
import { loadMarketRegions } from '@/sde/loadMarketSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';

export type PlaceIndexState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; index: PlaceIndex };

let cached: Promise<PlaceIndex | null> | null = null;

function loadPlaceIndex(): Promise<PlaceIndex | null> {
  cached ??= Promise.all([loadSolarSystemsById(), loadMarketRegions()])
    .then(([systems, regions]) =>
      systems ? buildPlaceIndex([...systems.values()], regions) : null
    )
    .catch(() => null)
    .then((index) => {
      if (!index) cached = null;
      return index;
    });
  return cached;
}

export function usePlaceIndex(enabled = true): PlaceIndexState {
  const loaded = useKeyedLoad('places', loadPlaceIndex, !enabled);
  return useMemo<PlaceIndexState>(() => {
    if (loaded.status === 'ready' && loaded.data) return { status: 'ready', index: loaded.data };
    return loaded.status === 'failed' || loaded.status === 'ready'
      ? { status: 'failed' }
      : { status: 'loading' };
  }, [loaded.status, loaded.data]);
}
