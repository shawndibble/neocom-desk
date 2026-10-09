import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';

/** Device-local (no `sync.` prefix): the ship you fly never reaches Firestore. */
const OWN_SHIP_KEY = 'dscan.ownShip';

const SHIP_CATEGORY_ID = 6;
/** Capsules and shuttles: not hulls anyone fits a danger read around. */
const EXCLUDED_GROUP_IDS: ReadonlySet<number> = new Set([29, 31]);

export interface ShipType {
  typeId: number;
  name: string;
  groupId: number;
}

let shipsPromise: Promise<ShipType[]> | null = null;

/** Every flyable ship hull in the SDE, by name. Loaded once, then memoised. */
export function listShipTypes(): Promise<ShipType[]> {
  shipsPromise ??= (async () => {
    const [types, categories] = await Promise.all([loadTypes(), loadGroupCategories()]);
    const ships: ShipType[] = [];
    for (const [id, type] of Object.entries(types)) {
      if (categories[String(type.groupID)] !== SHIP_CATEGORY_ID) continue;
      if (EXCLUDED_GROUP_IDS.has(type.groupID)) continue;
      ships.push({ typeId: Number(id), name: type.name, groupId: type.groupID });
    }
    return ships.sort((a, b) => a.name.localeCompare(b.name));
  })();
  shipsPromise.catch(() => {
    shipsPromise = null;
  });
  return shipsPromise;
}

/** Lower-cased, punctuation turned to spaces, runs of spaces collapsed. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Ships whose name starts with the query, then ones that contain it; empty query gives []. */
export function searchShips(ships: readonly ShipType[], query: string, limit = 8): ShipType[] {
  const q = normalize(query);
  if (!q) return [];
  const prefix: ShipType[] = [];
  const substring: ShipType[] = [];
  for (const ship of ships) {
    const name = normalize(ship.name);
    if (name.startsWith(q)) prefix.push(ship);
    else if (name.includes(q)) substring.push(ship);
  }
  return [...prefix, ...substring].slice(0, limit);
}

/** The hull the user typed in by hand, remembered on this device. */
export function useManualShip(): { typeId: number | null; setTypeId: (id: number | null) => void } {
  const stored = useLiveQuery(async () => (await db.settings.get(OWN_SHIP_KEY))?.value, []);
  const setTypeId = useCallback((id: number | null) => {
    void db.settings.put({ key: OWN_SHIP_KEY, value: id });
  }, []);
  return { typeId: typeof stored === 'number' ? stored : null, setTypeId };
}
