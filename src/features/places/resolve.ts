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
  opts: { name?: boolean; settle?: boolean } = {}
): Promise<ResolvedPlace> {
  const wantName = opts.name !== false;
  // `settle`: a read that throws is `null` for its own field only, so a failed
  // name never costs the system (and the reverse). Without it a throw
  // propagates, for a caller that must surface it.
  const read = <T>(p: Promise<T | null> | null): Promise<T | null> =>
    p === null ? Promise.resolve(null) : opts.settle ? p.catch(() => null) : p;
  const { locationId } = ref;
  const characterId = ref.characterId ?? null;
  switch (placeKindOf(ref)) {
    case 'solar_system':
      return {
        name: await read(wantName ? source.systemName(locationId) : null),
        systemId: locationId,
      };
    case 'station': {
      const [name, systemId] = await Promise.all([
        read(wantName ? source.stationName(locationId) : null),
        read(source.stationSystemId(locationId)),
      ]);
      return { name, systemId };
    }
    case 'structure': {
      if (characterId === null) return { name: null, systemId: null };
      const [name, systemId] = await Promise.all([
        read(wantName ? source.structureName(characterId, locationId) : null),
        read(source.structureSystemId(characterId, locationId)),
      ]);
      return { name, systemId };
    }
    default:
      return { name: null, systemId: null };
  }
}
