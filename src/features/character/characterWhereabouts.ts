/**
 * Where a character is and what it flies, for the Characters table's optional
 * "Docked at" and "Ship" columns. Read per character, a few at a
 * time, only while a column shows. Every lookup absorbs its own failure: a
 * structure the character is not on the ACL of, or an offline read, leaves that
 * part null and the row still renders.
 */
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
  /** Null when the location was not read (no grant, offline). */
  place: {
    /** Null when the system name could not be resolved. */
    systemName: string | null;
    dockedKind: 'station' | 'structure' | null;
    /** The station or structure name; null when docked but unresolvable. */
    dockedName: string | null;
  } | null;
  /** Hull type name; null when not read. */
  shipName: string | null;
}

/** What the Docked at cell prints for a read place, and how it sorts. */
export type PlaceLabel =
  | { kind: 'docked'; name: string }
  | { kind: 'structureIn'; system: string | null }
  | { kind: 'inSpace'; system: string | null };

export function placeLabel(place: NonNullable<CharacterWhereabouts['place']>): PlaceLabel {
  if (place.dockedKind === null) return { kind: 'inSpace', system: place.systemName };
  if (place.dockedName) return { kind: 'docked', name: place.dockedName };
  return { kind: 'structureIn', system: place.systemName };
}

/** The text a Docked at column sorts by: the station name, else the system. */
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
