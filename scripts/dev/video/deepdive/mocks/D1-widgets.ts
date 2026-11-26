/** Data for the three widgets D1 adds: skyhook raids, route kills (zKillboard) and the Quickbar. */
import type { Page } from '@playwright/test';
import { ALLIANCE } from '../cast';

const HOUR = 3_600_000;
const SOV = [
  { id: 30001153, name: 'F9E-KX', planet: 40_071_001, roman: 'IV', start: -1.2, end: 0.8 },
  { id: 30001154, name: '9KOE-A', planet: 40_071_011, roman: 'II', start: 0.7, end: 2.7 },
  { id: 30001155, name: 'U-QVWD', planet: 40_071_021, roman: 'VII', start: 3.5, end: 5.5 },
  { id: 30001156, name: 'B-3QPD', planet: 40_071_031, roman: 'III', start: 6.0, end: 8.0 },
];
const ACAO = { 'access-control-allow-origin': '*' };
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', headers: ACAO, body: JSON.stringify(body) });

/** Route Nourvukaiken > Tunttaras > Ikuchi > Jita (real gate path). */
export const SAVED_ROUTE = {
  key: 'travel.savedRoute',
  value: { fromId: 30001376, stops: [30000142], systems: [30001376, 30001379, 30000138, 30000142] },
};

export const QUICKBAR = [
  { typeId: 34, name: 'Tritanium' },
  { typeId: 37, name: 'Isogen' },
  { typeId: 38, name: 'Nocxium' },
  { typeId: 28668, name: 'Nanite Repair Paste' },
];

export async function installD1Widgets(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/(latest|dev|v\d+)\//, '/');
    if (path === '/skyhooks/raidable') {
      const now = Date.now();
      return route.fulfill(json({ skyhooks: SOV.map((s) => ({ solar_system_id: s.id, planet_id: s.planet, theft_vulnerability: { start: new Date(now + s.start * HOUR).toISOString(), end: new Date(now + s.end * HOUR).toISOString() } })) }));
    }
    if (path === '/sovereignty/systems') {
      return route.fulfill(json({ solar_systems: SOV.map((s) => ({ solar_system_id: s.id, claim: { alliance: { alliance_id: ALLIANCE.id } } })) }));
    }
    const planet = /^\/universe\/planets\/(\d+)$/.exec(path);
    if (planet) {
      const s = SOV.find((x) => x.planet === Number(planet[1]));
      if (s) return route.fulfill(json({ planet_id: s.planet, name: `${s.name} ${s.roman}`, system_id: s.id, type_id: 11, position: { x: 0, y: 0, z: 0 } }));
    }
    return route.fallback();
  });
  await page.route('https://zkillboard.com/api/kills/regionID/**', async (route) => {
    const region = Number(/regionID\/(\d+)/.exec(route.request().url())?.[1]);
    const now = Date.now();
    // [system, hours ago] per region: Ikuchi had three in the last day, Jita a handful, Nourvukaiken one.
    const table: Record<number, [number, number][]> = {
      10000016: [[30001376, 14.5], [30001379, 20.2]],
      10000002: [[30000138, 0.6], [30000138, 3.4], [30000138, 9.8], [30000142, 1.1], [30000142, 2.5], [30000142, 6.2], [30000142, 11.7], [30000142, 18.0]],
    };
    let id = 120_000_000;
    const body = (table[region] ?? []).map(([sys, h]) => ({
      killmail_id: ++id + region,
      killmail_time: new Date(now - h * HOUR).toISOString(),
      solar_system_id: sys,
      victim: { ship_type_id: 587, damage_taken: 1200 },
      attackers: [{ final_blow: true, damage_done: 1200 }],
      zkb: { totalValue: 8_500_000, npc: false, locationID: 40_000_000 + sys },
    }));
    await route.fulfill(json(body));
  });
}

/** Writes the Arden Quickbar straight into the app's IndexedDB (call on any app page). */
export async function seedQuickbar(page: Page, characterId: number): Promise<void> {
  await page.evaluate(
    ([id, items]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('neocom');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('quickbars', 'readwrite');
          tx.objectStore('quickbars').put({ id: String(id), characterId: id, items, updatedAt: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    [characterId, QUICKBAR] as const
  );
}
