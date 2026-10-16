import { classifyPlaceId } from '@/features/places/classify';

/**
 * What a mail's `showinfo:<typeID>[//<id>]` link opens in Neocom Desk. Typed
 * entities carry their own id (`//id`); anything else is an item type, which
 * covers skills and ships (Item Detail). A region, constellation, faction,
 * station or structure has no view yet and is `place`.
 */
export type ShowInfoTarget =
  | { kind: 'character' | 'corporation' | 'alliance' | 'system' | 'place'; id: number }
  | { kind: 'item'; typeId: number };

const CHARACTER_TYPE_FIRST = 1373;
const CHARACTER_TYPE_LAST = 1386;
const CORPORATION_TYPE = 2;
const REGION_TYPE = 3;
const CONSTELLATION_TYPE = 4;
const SOLAR_SYSTEM_TYPE = 5;
const FACTION_TYPE = 30;
const ALLIANCE_TYPE = 16159;

export function resolveShowInfo(typeId: number, id: number | null): ShowInfoTarget {
  if (id !== null && id > 0) {
    const placeKind = classifyPlaceId(id);
    if (typeId === SOLAR_SYSTEM_TYPE || placeKind === 'solar_system') return { kind: 'system', id };
    if (placeKind !== null) return { kind: 'place', id };
    if (typeId === REGION_TYPE || typeId === CONSTELLATION_TYPE || typeId === FACTION_TYPE) {
      return { kind: 'place', id };
    }
    if (typeId >= CHARACTER_TYPE_FIRST && typeId <= CHARACTER_TYPE_LAST) {
      return { kind: 'character', id };
    }
    if (typeId === CORPORATION_TYPE) return { kind: 'corporation', id };
    if (typeId === ALLIANCE_TYPE) return { kind: 'alliance', id };
  }
  return { kind: 'item', typeId };
}
