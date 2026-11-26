/** D14: Halcyon Forge Industries' corporation asset list (offices, containers, fuel bays) and its seeded stock targets. Install after installHalcyonEsi. */
import type { Page } from '@playwright/test';
import { STATIONS } from '../cast';
import { BASE_PRICE, basePrice } from '../catalog';
import { CORP_ID, DAY, STRUCTURES } from './D13-hfind';
import { nameOf } from './D13-esi';

const T = {
  nitrogen: 4051, hydrogen: 4246, oxygen: 4312, helium: 4247,
  zeolites: 45490, sylvite: 45491, bitumens: 45492,
  scourgeFury: 2629, novaHeavy: 206, voidM: 12789, hailM: 12777, antimatterM: 230,
  nanite: 28668, tritanium: 34, pyerite: 35, veldspar: 1230, cVeldspar: 62516, cScordite: 62520, kernite: 20, plagioclase: 18,
  lse2: 3841, mse2: 3831, dcu2: 2048, bcs2: 22291, hml2: 2410, disruptor2: 3244, webifier2: 527, arm2: 3530, hammerhead2: 2185,
  stationContainer: 17366, secureContainer: 3465,
};
const EXTRA_PRICE: Record<number, number> = {
  [T.nitrogen]: 1_450, [T.hydrogen]: 1_380, [T.oxygen]: 1_520, [T.helium]: 1_410,
  [T.zeolites]: 1_200, [T.sylvite]: 1_500, [T.bitumens]: 1_000,
  [T.scourgeFury]: 2_450, [T.novaHeavy]: 410, [T.voidM]: 118, [T.hailM]: 96, [T.antimatterM]: 38,
  [T.nanite]: 1_130, [T.tritanium]: 5.2, [T.pyerite]: 11.4, [T.veldspar]: 16.8, [T.cVeldspar]: 16.8, [T.cScordite]: 11.1, [T.kernite]: 140, [T.plagioclase]: 29,
  [T.lse2]: 3_900_000, [T.mse2]: 1_080_000, [T.dcu2]: 1_240_000, [T.bcs2]: 1_460_000, [T.hml2]: 480_000, [T.disruptor2]: 520_000,
  [T.webifier2]: 410_000, [T.arm2]: 690_000, [T.hammerhead2]: 205_000,
  [T.stationContainer]: 320_000, [T.secureContainer]: 410_000,
};

type Flag = number | 'deliveries';
interface Place { id: number; station: boolean; items: { div: Flag; type: number; qty: number }[]; containers?: { div: number; type: number; name: string; contents: [number, number][] }[] }

export const PLACES: Place[] = [
  {
    id: STRUCTURES[6].id, station: false,
    items: [
      { div: 3, type: T.lse2, qty: 40 }, { div: 3, type: T.mse2, qty: 62 }, { div: 3, type: T.dcu2, qty: 35 }, { div: 3, type: T.bcs2, qty: 48 },
      { div: 4, type: T.tritanium, qty: 6_400_000 }, { div: 4, type: T.pyerite, qty: 1_850_000 },
      { div: 7, type: T.nitrogen, qty: 1_300 }, { div: 7, type: T.hydrogen, qty: 3_100 }, { div: 7, type: T.scourgeFury, qty: 4_000 }, { div: 7, type: T.voidM, qty: 38_000 },
    ],
    containers: [
      { div: 7, type: T.secureContainer, name: 'Quartermaster Crate', contents: [[T.nitrogen, 1_500], [T.hydrogen, 1_100], [T.nanite, 2_400], [T.antimatterM, 21_000]] },
    ],
  },
  {
    id: STRUCTURES[1].id, station: false,
    items: [
      { div: 2, type: T.cVeldspar, qty: 180_000 }, { div: 2, type: T.cScordite, qty: 96_000 }, { div: 2, type: T.kernite, qty: 41_500 }, { div: 2, type: T.plagioclase, qty: 28_000 },
      { div: 7, type: T.hydrogen, qty: 900 }, { div: 7, type: T.scourgeFury, qty: 3_400 }, { div: 7, type: T.novaHeavy, qty: 14_000 }, { div: 7, type: T.nitrogen, qty: 0 },
    ],
  },
  {
    id: STRUCTURES[4].id, station: false,
    items: [{ div: 1, type: T.zeolites, qty: 52_000 }, { div: 1, type: T.sylvite, qty: 78_000 }, { div: 1, type: T.bitumens, qty: 41_000 }, { div: 3, type: T.hammerhead2, qty: 90 }],
    containers: [{ div: 1, type: T.secureContainer, name: 'Chunk Haul Can', contents: [[T.sylvite, 24_000], [T.zeolites, 18_500]] }],
  },
  {
    id: STATIONS.nourvukaiken, station: true,
    items: [
      { div: 3, type: T.hml2, qty: 28 }, { div: 3, type: T.disruptor2, qty: 22 }, { div: 3, type: T.webifier2, qty: 31 }, { div: 3, type: T.arm2, qty: 26 },
      { div: 7, type: T.voidM, qty: 24_000 }, { div: 7, type: T.hailM, qty: 18_000 },
    ],
  },
  {
    id: STATIONS.tunttaras, station: true,
    items: [{ div: 'deliveries', type: T.nitrogen, qty: 0 }, { div: 'deliveries', type: T.hailM, qty: 22_000 }, { div: 'deliveries', type: T.voidM, qty: 12_000 }, { div: 7, type: T.nanite, qty: 3_400 }],
  },
];

export const FUEL_BAY: Record<number, number> = {
  35835: T.hydrogen, 35836: T.helium, 35833: T.nitrogen, 35825: T.oxygen,
};
const PER_DAY: Record<number, number> = { 35835: 132, 35836: 188, 35833: 356, 35825: 184 };

let nextId = 3_400_000_000;
export const CONTAINER_NAMES = new Map<number, string>();

export function buildAssets() {
  nextId = 3_400_000_000;
  CONTAINER_NAMES.clear();
  const out: Record<string, unknown>[] = [];
  const row = (type: number, qty: number, locationId: number, locationType: string, flag: string, singleton = false) => {
    const item_id = nextId++;
    out.push({ item_id, type_id: type, quantity: qty, location_id: locationId, location_type: locationType, location_flag: flag, is_singleton: singleton });
    return item_id;
  };
  for (const place of PLACES) {
    const office = row(27, 1, place.id, place.station ? 'station' : 'other', 'OfficeFolder', true);
    for (const item of place.items) {
      if (item.qty === 0) continue;
      if (item.div === 'deliveries') row(item.type, item.qty, place.id, place.station ? 'station' : 'other', 'CorpDeliveries');
      else row(item.type, item.qty, office, 'item', `CorpSAG${item.div}`);
    }
    for (const box of place.containers ?? []) {
      const id = row(box.type, 1, office, 'item', `CorpSAG${box.div}`, true);
      CONTAINER_NAMES.set(id, box.name);
      for (const [type, qty] of box.contents) row(type, qty, id, 'item', 'Unlocked');
    }
  }
  for (const s of STRUCTURES) {
    const type = FUEL_BAY[s.typeId];
    row(type, Math.round(PER_DAY[s.typeId] * (s.fuelDays ?? 0)), s.id, 'other', 'StructureFuel');
  }
  return out;
}

export const SEEDED_TARGETS = { [String(CORP_ID)]: { [String(T.hydrogen)]: 8_000, [String(T.scourgeFury)]: 20_000, [String(T.tritanium)]: 5_000_000, [String(T.voidM)]: 50_000 } };
export const NITROGEN_TARGET = 6_000;
export const STOCK_TARGETS_SETTING = { key: 'sync.corpStockTargets', value: SEEDED_TARGETS };

export async function installAssets(page: Page): Promise<void> {
  const ACAO = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-pages' };
  await page.route('https://esi.evetech.net/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/(latest|dev|v\d+)\//, '/');
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { ...ACAO, 'x-pages': '1', expires: new Date(Date.now() + 3_600_000).toUTCString() }, body: JSON.stringify(body) });
    if (path === `/corporations/${CORP_ID}/assets`) return json(buildAssets());
    if (path === `/corporations/${CORP_ID}/assets/names` && request.method() === 'POST') {
      const ids = request.postDataJSON() as number[];
      return json(ids.filter((id) => CONTAINER_NAMES.has(id)).map((id) => ({ item_id: id, name: CONTAINER_NAMES.get(id)! })));
    }
    if (path === '/markets/prices') {
      const ids = new Set([...Object.keys(BASE_PRICE).map(Number), ...Object.keys(EXTRA_PRICE).map(Number)]);
      return json([...ids].map((id) => { const p = EXTRA_PRICE[id] ?? basePrice(id); return { type_id: id, average_price: p, adjusted_price: p * 0.97 }; }));
    }
    if (path === '/universe/names' && request.method() === 'POST') {
      const ids = request.postDataJSON() as number[];
      return json(ids.map((id) => ({ id, ...(nameOf(id) ?? { name: `Pilot ${id}`, category: 'character' }) })));
    }
    return route.fallback();
  });
}
void DAY;
