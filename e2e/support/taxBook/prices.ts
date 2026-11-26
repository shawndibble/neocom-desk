import type { Page } from '@playwright/test';
import { DAY_MS } from '../../../src/lib/age';
import { utcDay } from '../../../src/engine/localDay';
import { TRADE_HUBS } from '../../../src/market/hubs';

export const UNIT_PRICE = 1_000;
const DAYS = 200;

function entry(closeByBack: Readonly<Record<number, number>> = {}) {
  const dates = Array.from({ length: DAYS + 1 }, (_, d) =>
    utcDay(Date.now() - (DAYS - d) * DAY_MS)
  );
  const prices = dates.map((_, d) => closeByBack[DAYS - d] ?? UNIT_PRICE);
  return {
    dates,
    stations: Object.fromEntries(
      TRADE_HUBS.map((hub) => [String(hub.stationId), { buy: prices, sell: prices }])
    ),
  };
}

export async function installFlatPrices(
  page: Page,
  closeByBack: Readonly<Record<number, number>> = {}
): Promise<void> {
  const body = JSON.stringify(entry(closeByBack));
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
    if (!/\/open-prices\/\d+\.json$/.test(path)) return route.fallback();
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body });
  });
}

export const installDayPrices = installFlatPrices;
