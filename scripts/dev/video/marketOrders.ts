/**
 * Mock region order books for the promo-video recordings: every Market Region answers with a
 * spread of sell and buy orders at its own NPC stations, so Market Browser's All regions view
 * fills with hundreds of rows and a Jump Range visibly narrows them. Deterministic (no
 * Math.random) so every take records the same table. Hubs get the deepest, cheapest books.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mix } from '../sandbox/gen';

interface Station {
  id: number;
  systemId: number;
}
interface System {
  id: number;
  regionId: number;
  security: number;
}

const data = (file: string) =>
  JSON.parse(readFileSync(new URL(`../../../public/data/market/${file}`, import.meta.url), 'utf8'));

const systems = new Map<number, System>(
  (data('systems.json') as System[]).map((system) => [system.id, system])
);
const stationsByRegion = new Map<number, Station[]>();
for (const station of data('stations.json') as Station[]) {
  const regionId = systems.get(station.systemId)?.regionId;
  if (regionId === undefined) continue;
  const list = stationsByRegion.get(regionId) ?? [];
  list.push(station);
  stationsByRegion.set(regionId, list);
}

/** Trade hub systems and their markup: deeper books, lower prices, Jita cheapest. */
const HUB_MARKUP = new Map([
  [30000142, 1],
  [30002187, 1.012],
  [30002659, 1.02],
  [30002053, 1.035],
  [30002510, 1.045],
]);

export function regionOrders(regionId: number, typeId: number, basePrice: number): unknown[] {
  const stations = stationsByRegion.get(regionId) ?? [];
  const orders: unknown[] = [];
  let orderId = regionId * 1000;
  stations.forEach((station, index) => {
    const seed = mix(station.id + typeId);
    const hubMarkup = HUB_MARKUP.get(station.systemId);
    const hub = hubMarkup !== undefined;
    // Roughly one station in five carries the item, every hub station does.
    if (!hub && seed % 5 !== 0) return;
    const sellCount = hub ? 4 : 1 + (seed % 2);
    for (let n = 0; n < sellCount; n += 1) {
      const markup = hub ? hubMarkup + n * 0.004 : 1.06 + ((seed + n * 37) % 40) / 100;
      orders.push({
        order_id: orderId++,
        type_id: typeId,
        location_id: station.id,
        system_id: station.systemId,
        is_buy_order: false,
        price: Math.round(basePrice * markup * 100) / 100,
        volume_total: 5000,
        volume_remain: 200 + ((seed * (n + 3)) % 4800),
        min_volume: 1,
        duration: 90,
        range: 'region',
        issued: new Date(Date.now() - ((seed + index) % 72) * 3_600_000).toISOString(),
      });
    }
    if (hub || seed % 3 === 0) {
      orders.push({
        order_id: orderId++,
        type_id: typeId,
        location_id: station.id,
        system_id: station.systemId,
        is_buy_order: true,
        price: Math.round(basePrice * (hub ? 0.97 : 0.8 + (seed % 10) / 100) * 100) / 100,
        volume_total: 10000,
        volume_remain: 1000 + ((seed * 7) % 9000),
        min_volume: 1,
        duration: 90,
        range: hub ? 'station' : 'region',
        issued: new Date(Date.now() - (seed % 48) * 3_600_000).toISOString(),
      });
    }
  });
  return orders;
}

/** Answers `GET /markets/{region}/orders` for every region; register after `installEsiMock`. */
export async function installRegionOrders(page: Page, basePrices: Record<number, number>) {
  await page.route(/esi\.evetech\.net\/.*\/?markets\/\d+\/orders/, async (route) => {
    const url = new URL(route.request().url());
    const regionId = Number(/markets\/(\d+)\/orders/.exec(url.pathname)?.[1]);
    const typeId = Number(url.searchParams.get('type_id'));
    const base = basePrices[typeId] ?? 1_000_000;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-pages': '1' },
      body: JSON.stringify(regionOrders(regionId, typeId, base)),
    });
  });
}
