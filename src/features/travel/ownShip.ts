import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { SHIP_CATEGORY_ID } from '@/sde/categories';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';

const OWN_SHIP_KEY = 'dscan.ownShip';

const EXCLUDED_GROUP_IDS: ReadonlySet<number> = new Set([29, 31]);

export interface ShipType {
  typeId: number;
  name: string;
  groupId: number;
}

let shipsPromise: Promise<ShipType[]> | null = null;

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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

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

export function useManualShip(): { typeId: number | null; setTypeId: (id: number | null) => void } {
  const stored = useLiveQuery(async () => (await db.settings.get(OWN_SHIP_KEY))?.value, []);
  const setTypeId = useCallback((id: number | null) => {
    void db.settings.put({ key: OWN_SHIP_KEY, value: id });
  }, []);
  return { typeId: typeof stored === 'number' ? stored : null, setTypeId };
}
