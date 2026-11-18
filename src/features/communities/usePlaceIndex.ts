import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { buildPlaceIndex, type PlaceIndex } from '@/engine/communities/requestPlaces';
import { loadMarketRegions } from '@/sde/loadMarketSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';

export type PlaceIndexState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; index: PlaceIndex };

let cached: Promise<PlaceIndex | null> | null = null;

/** The system and region names as one index, built once per session; null when the snapshot cannot be read. */
function loadPlaceIndex(): Promise<PlaceIndex | null> {
  cached ??= Promise.all([loadSolarSystemsById(), loadMarketRegions()])
    .then(([systems, regions]) =>
      systems ? buildPlaceIndex([...systems.values()], regions) : null
    )
    .catch(() => null)
    .then((index) => {
      if (!index) cached = null; // allow a retry on the next use
      return index;
    });
  return cached;
}

/** The place index, read once `enabled`. Shared by the compose picker and the distance filter. */
export function usePlaceIndex(enabled = true): PlaceIndexState {
  const loaded = useKeyedLoad('places', loadPlaceIndex, !enabled);
  if (loaded.status === 'ready')
    return loaded.data ? { status: 'ready', index: loaded.data } : { status: 'failed' };
  return loaded.status === 'failed' ? { status: 'failed' } : { status: 'loading' };
}
