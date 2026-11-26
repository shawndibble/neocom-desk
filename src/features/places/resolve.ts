import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadStructureName, loadStructureSystemId } from '@/features/character/structures';
import { loadSystemName, loadSystemSecurity } from '@/features/character/systemSecurity';
import { placeKindOf } from './classify';
import type { PlaceRef, PlaceSource } from './types';

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

export async function resolvePlace(
  ref: PlaceRef,
  source: PlaceSource = productionPlaceSource,
  opts: { name?: boolean; settle?: boolean } = {}
): Promise<ResolvedPlace> {
  const wantName = opts.name !== false;
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
