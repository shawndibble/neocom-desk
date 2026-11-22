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

/** `closeByBack`: the price of the day `back` days ago, where it is not `UNIT_PRICE`. */
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
  /** Days whose saved close-of-day price is not `UNIT_PRICE`, by days back (`installDayPrices`). */
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

/**
 * The hub's saved close-of-day price of some days, over the flat ones: a day the book prices at
 * close that is not what the pilot's estimate was. Registered after the flat prices, so it answers
 * first; call it again (and reload) to move a close price mid-test.
 */
export const installDayPrices = installFlatPrices;
