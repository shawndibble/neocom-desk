import { useEffect, useState } from 'react';
import { classifyPlaceInfoId } from '@/features/places';
import { SHIP_CATEGORY_ID, SKILL_CATEGORY_ID } from '@/sde/categories';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';

/**
 * What a mail's `showinfo:<typeID>[//<id>]` link opens in Neocom Desk. Typed
 * entities carry their own id (`//id`); anything else is an item type, which
 * covers skills and ships (Item Detail). A region, station or structure is
 * `place` (Place Info); a constellation or faction has no view (`noView`).
 */
export type ShowInfoTarget =
  | { kind: 'character' | 'corporation' | 'alliance' | 'system' | 'place'; id: number }
  | { kind: 'item'; typeId: number }
  | { kind: 'noView' };

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
    const placeKind = classifyPlaceInfoId(id);
    if (typeId === SOLAR_SYSTEM_TYPE || placeKind === 'solar_system') return { kind: 'system', id };
    if (placeKind !== null) return { kind: 'place', id };
    if (typeId === REGION_TYPE || typeId === CONSTELLATION_TYPE || typeId === FACTION_TYPE) {
      return { kind: 'noView' };
    }
    if (typeId >= CHARACTER_TYPE_FIRST && typeId <= CHARACTER_TYPE_LAST) {
      return { kind: 'character', id };
    }
    if (typeId === CORPORATION_TYPE) return { kind: 'corporation', id };
    if (typeId === ALLIANCE_TYPE) return { kind: 'alliance', id };
  }
  return { kind: 'item', typeId };
}

export type ItemKind = 'skill' | 'ship' | 'item';

/** What an item type is, from its group's category. Unknown groups are a plain item. */
export function itemKindOfGroup(
  groupId: number | undefined,
  categories: Readonly<Record<string, number>>
): ItemKind {
  const category = groupId === undefined ? undefined : categories[String(groupId)];
  if (category === SKILL_CATEGORY_ID) return 'skill';
  if (category === SHIP_CATEGORY_ID) return 'ship';
  return 'item';
}

/**
 * Whether a typeID is a skill, ship or other item, from the SDE (loaded once,
 * then memoised). `'item'` until it resolves, and for a type the SDE lacks.
 * There is no ship-by-typeID window outside the Ship Tree, so a ship opens
 * Item Detail like any item.
 */
export function useItemKind(typeId: number): ItemKind {
  const [state, setState] = useState<{ typeId: number; kind: ItemKind } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadTypes(), loadGroupCategories()])
      .then(([types, categories]) => {
        if (!cancelled) {
          setState({ typeId, kind: itemKindOfGroup(types[String(typeId)]?.groupID, categories) });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [typeId]);
  return state?.typeId === typeId ? state.kind : 'item';
}
