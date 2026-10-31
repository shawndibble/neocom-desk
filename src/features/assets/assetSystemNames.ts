import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { resolvePlace } from '@/features/places/resolve';
import type { PlaceRef } from '@/features/places/types';
import type { CharacterAsset } from '@/esi/endpoints';

/**
 * The places the assets sit in directly under a station, structure or solar
 * system, once each, with the Character who holds an asset there (a structure's
 * system is ACL-checked per Character). Only places whose name resolved are
 * asked about, so the reads are served from the cache that name filled and a
 * place that 404s or 5xxs is never asked a second time.
 */
export function rootPlaceRefs(
  assets: readonly CharacterAsset[],
  locationNames: ReadonlyMap<number, string>,
  ownerOf: (itemId: number) => number | null
): PlaceRef[] {
  const itemIds = new Set(assets.map((asset) => asset.item_id));
  const refs = new Map<string, PlaceRef>();
  for (const asset of assets) {
    const { location_id: locationId, location_type: type } = asset;
    // An 'item' parent with no row of its own is a structure ESI never listed.
    if (type === 'item' && itemIds.has(locationId)) continue;
    if (type === 'solar_system' || !locationNames.has(locationId)) continue;
    const kind = type === 'station' ? 'station' : 'structure';
    const characterId = kind === 'structure' ? ownerOf(asset.item_id) : null;
    refs.set(`${locationId}:${characterId ?? ''}`, { locationId, characterId, kind });
  }
  return [...refs.values()];
}

/** The system name of each place, by location id; a read that fails leaves its place out. */
export async function loadPlaceSystemNames(
  refs: readonly PlaceRef[]
): Promise<Map<number, string>> {
  const systemOf = new Map<number, number>();
  await Promise.all(
    refs.map(async (ref) => {
      const { systemId } = await resolvePlace(ref, undefined, { name: false, settle: true });
      if (systemId !== null) systemOf.set(ref.locationId, systemId);
    })
  );
  const names = new Map<number, string>();
  await Promise.all(
    [...new Set(systemOf.values())].map(async (systemId) => {
      const { name } = await resolvePlace(
        { locationId: systemId, kind: 'solar_system' },
        undefined,
        { settle: true }
      );
      if (name) names.set(systemId, name);
    })
  );
  const byLocation = new Map<number, string>();
  for (const [locationId, systemId] of systemOf) {
    const name = names.get(systemId);
    if (name) byLocation.set(locationId, name);
  }
  return byLocation;
}

/**
 * The export's System column: read once an export menu has opened, so a page
 * visit that never exports pays nothing. `pending` marks a file made before it lands.
 */
export function useExportSystemNames(
  armed: boolean,
  refs: readonly PlaceRef[]
): { names: ReadonlyMap<number, string>; pending: boolean } {
  // Keyed by what is asked, so a new asset list re-reads and the same one does not.
  const key = armed ? refs.map((r) => `${r.locationId}:${r.characterId ?? ''}`).join(',') : null;
  const load = useCallback(() => loadPlaceSystemNames(refs), [refs]);
  const loaded = useKeyedLoad(key, load);
  return {
    names: loaded.data ?? NO_SYSTEM_NAMES,
    pending: armed && loaded.status !== 'ready' && loaded.status !== 'failed',
  };
}

const NO_SYSTEM_NAMES: ReadonlyMap<number, string> = new Map();
