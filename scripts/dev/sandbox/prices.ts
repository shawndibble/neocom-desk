/**
 * Open Prices for the sandbox: the R2 host (data.neocomdesk.com/open-prices) answers any type id
 * with a plausible 30-day buy/sell series at each Trade Hub station, so every page that values
 * something (mining, moons, assets, PI, industry) shows ISK instead of "unpriced".
 *
 * Shape: src/features/market/marketOpenPrices.ts (`{dates, stations: {<stationId>: {buy, sell}}}`).
 * The shard route answers an empty shard; the per-type fallback route does the generating.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { mix } from './gen';

const HUB_STATIONS = [60003760, 60008494, 60011866, 60004588, 60005686, 60015249];
const DAYS = 30;

/** Rough base prices (ISK) for the type ids the sandbox data uses. */
const BASE_PRICE: Record<number, number> = {
  34: 5,
  35: 10,
  36: 80,
  37: 60,
  38: 1_000,
  40: 2_200, // minerals
  1230: 15,
  1228: 20,
  1224: 25, // ore
  45490: 1_200,
  45491: 1_500,
  45492: 1_000, // moon ore (the Corp Tax Book seed's prices)
  587: 450_000,
  24698: 25_000_000,
  638: 250_000_000,
  16240: 350_000,
  22544: 250_000_000,
  17476: 60_000_000,
  28606: 700_000_000, // ships
  2048: 600_000,
  3841: 4_000_000,
  12058: 1_200_000,
  21896: 30,
};

// Run from the repo root (the skill does): reads the app's own ore tables.
const readData = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'public/data', name), 'utf8')) as T;
const MOON_ORES = new Set(readData<number[]>('moonOreTypes.json'));
/** Compressed type id -> raw ore type id. A Compressed unit is one raw unit, a hundredth of the volume, so it prices the same. */
const RAW_OF_COMPRESSED = new Map(
  Object.entries(readData<Record<string, number>>('compressedOreTypeIds.json')).map(
    ([raw, compressed]) => [compressed, Number(raw)]
  )
);

function basePrice(typeId: number): number {
  const known = BASE_PRICE[typeId];
  if (known !== undefined) return known;
  const raw = RAW_OF_COMPRESSED.get(typeId);
  if (raw !== undefined) return basePrice(raw);
  if (MOON_ORES.has(typeId)) return 1_300;
  return 50 + mix(typeId) * 20;
}

function series(typeId: number, stationId: number) {
  const base = basePrice(typeId) * (0.96 + (stationId % 7) / 100);
  const sell = Array.from(
    { length: DAYS },
    (_, d) => Math.round(base * (1 + (mix(typeId + d * 13) - 500) / 6_000) * 100) / 100
  );
  const buy = sell.map((p) => Math.round(p * 0.93 * 100) / 100);
  return { buy, sell };
}

function entry(typeId: number) {
  const dates = Array.from({ length: DAYS }, (_, d) =>
    new Date(Date.now() - (DAYS - d) * 86_400_000).toISOString().slice(0, 10)
  );
  return {
    dates,
    stations: Object.fromEntries(HUB_STATIONS.map((id) => [String(id), series(typeId, id)])),
  };
}

export async function installOpenPrices(page: Page): Promise<void> {
  await page.route('https://data.neocomdesk.com/open-prices/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*' };
    if (path.startsWith('/open-prices/shards/')) {
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: '{"types":{}}',
      });
    }
    const typeId = Number(/\/open-prices\/(\d+)\.json$/.exec(path)?.[1]);
    if (!Number.isInteger(typeId)) return route.fallback();
    return route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(entry(typeId)),
    });
  });
}
