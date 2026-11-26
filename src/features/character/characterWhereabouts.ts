import { ESI_REGISTRY } from '@/esi/registry';
import { loadCharacterPlaceRead } from './location';
import { loadCharacterShipTypeRead } from './ship';
import { loadStationName } from './stations';
import { loadStructureNameNoRoster } from './structures';
import { loadSystemName } from './systemSecurity';
import { loadTypeNames } from './typeNames';

export const LOCATION_SCOPE = ESI_REGISTRY.getCharacterLocation.scope;
export const SHIP_SCOPE = ESI_REGISTRY.getCharacterShip.scope;

export interface CharacterWhereabouts {
  place: {
    systemName: string | null;
    dockedKind: 'station' | 'structure' | null;
    dockedName: string | null;
  } | null;
  shipName: string | null;
}

export type PlaceLabel =
  | { kind: 'docked'; name: string }
  | { kind: 'structureIn'; system: string | null }
  | { kind: 'inSpace'; system: string | null };

export function placeLabel(place: NonNullable<CharacterWhereabouts['place']>): PlaceLabel {
  if (place.dockedKind === null) return { kind: 'inSpace', system: place.systemName };
  if (place.dockedName) return { kind: 'docked', name: place.dockedName };
  return { kind: 'structureIn', system: place.systemName };
}

export function placeSortText(place: CharacterWhereabouts['place']): string | undefined {
  if (!place) return undefined;
  const label = placeLabel(place);
  return label.kind === 'docked' ? label.name : (label.system ?? '');
}

const settle = <T>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);

export async function loadCharacterWhereabouts(
  characterId: number,
  grants: { location: boolean; ship: boolean }
): Promise<CharacterWhereabouts> {
  const [placeRead, shipRead] = await Promise.all([
    grants.location ? settle(loadCharacterPlaceRead(characterId)) : null,
    grants.ship ? settle(loadCharacterShipTypeRead(characterId)) : null,
  ]);
  const raw = placeRead?.place ?? null;
  const shipTypeId = shipRead?.typeId ?? null;
  const [systemName, dockedName, shipName] = await Promise.all([
    raw ? settle(loadSystemName(raw.systemId)) : null,
    raw?.stationId != null
      ? settle(loadStationName(raw.stationId))
      : raw?.structureId != null
        ? settle(loadStructureNameNoRoster(characterId, raw.structureId))
        : null,
    shipTypeId === null
      ? null
      : settle(loadTypeNames([shipTypeId])).then((names) => names?.get(shipTypeId) ?? null),
  ]);
  return {
    place: raw
      ? {
          systemName,
          dockedKind:
            raw.stationId != null ? 'station' : raw.structureId != null ? 'structure' : null,
          dockedName,
        }
      : null,
    shipName,
  };
}
