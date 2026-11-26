import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { DAY_MS } from '../../../src/lib/age';
import { roundIsk } from '../../../src/lib/isk';
import { utcDay } from '../../../src/engine/localDay';
import { TRADE_HUBS } from '../../../src/market/hubs';
import { mix } from './gen';

const HUB_STATIONS = TRADE_HUBS.map((hub) => hub.stationId);
const DAYS = 30;

const BASE_PRICE: Record<number, number> = {
  34: 5,
  35: 10,
  36: 80,
  37: 60,
  38: 1_000,
  40: 2_200,
  1230: 15,
  1228: 20,
  1224: 25,
  45490: 1_200,
  45491: 1_500,
  45492: 1_000,
  587: 450_000,
  24698: 25_000_000,
  638: 250_000_000,
  16240: 350_000,
  22544: 250_000_000,
  17476: 60_000_000,
  28606: 700_000_000,
  2048: 600_000,
  3841: 4_000_000,
  12058: 1_200_000,
  21896: 30,
};

const readData = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'public/data', name), 'utf8')) as T;
const MOON_ORES = new Set(readData<number[]>('moonOreTypes.json'));
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
  const sell = Array.from({ length: DAYS }, (_, d) =>
    roundIsk(base * (1 + (mix(typeId + d * 13) - 500) / 6_000))
  );
  const buy = sell.map((p) => roundIsk(p * 0.93));
  return { buy, sell };
}

function entry(typeId: number) {
  const dates = Array.from({ length: DAYS }, (_, d) => utcDay(Date.now() - (DAYS - d) * DAY_MS));
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
