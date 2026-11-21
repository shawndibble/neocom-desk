/**
 * Flat Open Prices for the Corp Tax Book specs: every type costs `UNIT_PRICE` ISK at every Trade
 * Hub on every day, buy and sell alike, so a mined day's tax is plain arithmetic
 * (`quantity x UNIT_PRICE x rate`) and a spec can state the figure it expects. Shape:
 * `src/features/market/marketOpenPrices.ts`, as `scripts/dev/sandbox/prices.ts` serves it.
 */
import type { Page } from '@playwright/test';
import { DAY_MS } from '../../../src/lib/age';
import { utcDay } from '../../../src/engine/localDay';
import { TRADE_HUBS } from '../../../src/market/hubs';

export const UNIT_PRICE = 1_000;
/** Far enough back for the oldest seeded book (`HISTORY_DAYS` in bookSeed.ts) and a margin. */
const DAYS = 200;

function entry() {
  const dates = Array.from({ length: DAYS + 1 }, (_, d) =>
    utcDay(Date.now() - (DAYS - d) * DAY_MS)
  );
  const flat = dates.map(() => UNIT_PRICE);
  return {
    dates,
    stations: Object.fromEntries(
      TRADE_HUBS.map((hub) => [String(hub.stationId), { buy: flat, sell: flat }])
    ),
  };
}

export async function installFlatPrices(page: Page): Promise<void> {
  const body = JSON.stringify(entry());
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
