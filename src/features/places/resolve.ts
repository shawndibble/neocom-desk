import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadStructureName, loadStructureSystemId } from '@/features/character/structures';
import { loadSystemName, loadSystemSecurity } from '@/features/character/systemSecurity';
import { placeKindOf } from './classify';
import type { PlaceRef, PlaceSource } from './types';

/** The production seam: the existing loaders, each looked up at call time. */
export const productionPlaceSource: PlaceSource = {
  stationName: (id) => loadStationName(id),
  stationSystemId: (id) => loadStationSystemId(id),
  structureName: (characterId, id) => loadStructureName(characterId, id),
  structureSystemId: (characterId, id) => loadStructureSystemId(characterId, id),
  systemName: (id) => loadSystemName(id),
  systemSecurity: (id) => loadSystemSecurity(id),
};

export interface ResolvedPlace {
  name: string | null;
  systemId: number | null;
}

/**
 * A location's name and the solar system it sits in. A solar system is its own
 * system; a station comes from the SDE snapshot; a structure goes through the
 * asking Character (`null` for no Character or no access). `name: false` skips
 * the name read for a caller that only wants the system.
 */
export async function resolvePlace(
  ref: PlaceRef,
  source: PlaceSource = productionPlaceSource,
  opts: { name?: boolean } = {}
): Promise<ResolvedPlace> {
  const wantName = opts.name !== false;
  const { locationId, characterId } = ref;
  switch (placeKindOf(ref)) {
    case 'solar_system':
      return {
        name: wantName ? await source.systemName(locationId) : null,
        systemId: locationId,
      };
    case 'station': {
      const [name, systemId] = await Promise.all([
        wantName ? source.stationName(locationId) : null,
        source.stationSystemId(locationId),
      ]);
      return { name, systemId };
    }
    case 'structure': {
      if (characterId === null) return { name: null, systemId: null };
      const [name, systemId] = await Promise.all([
        wantName ? source.structureName(characterId, locationId) : null,
        source.structureSystemId(characterId, locationId),
      ]);
      return { name, systemId };
    }
    default:
      return { name: null, systemId: null };
  }
}
