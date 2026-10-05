/**
 * Market Browser Sell/Buy order-book tables overflowed the whole page
 * horizontally (#2093): both `DataTable` call sites in `Market.tsx` were
 * missing the `overflow-x-auto` wrapper some other `DataTable` callers use
 * (`MaterialsTable.tsx`, `Characters.tsx`) — with the default all-columns
 * column set (`DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS`, all 8 ids) and a long
 * station name, the bare `<table>` forced `<html>` itself to scroll sideways
 * instead of just the table.
 *
 * Buy orders carry `range`/`minVolume` on top of Sell's columns, so they're
 * the wider table — this asserts on the page opened with mocked orders for
 * both, all columns visible (the default), a long NPC station name, and
 * checks the page-level scrollWidth bound `expectNoPageOverflow` already
 * uses for this exact failure mode (#1708) at pointer-input widths —
 * and, since the order book rework, that neither table scrolls sideways
 * inside its own wrapper either.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';
import type { MarketOrder } from '../src/esi/endpoints';

const WIDTHS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  // Either side of where the rows become cards with every column showing
  // (`orderBookWidthsRem`), and of where Location narrows before that.
  { width: 1400, height: 900 },
  // The tightest table: the book just over its `cards` width.
  { width: 1415, height: 900 },
  { width: 1440, height: 900 },
  { width: 1500, height: 900 },
  { width: 1560, height: 900 },
];

const REGION = 10000002;
/** Jita 4-4 Caldari Navy Assembly Plant — a real NPC station id with a long name, so station-name resolution never has to guess and the location column is as wide as it gets. */
const STATION_A = 60003760;

function order(
  fields: Pick<MarketOrder, 'order_id' | 'type_id' | 'price' | 'is_buy_order'> &
    Partial<MarketOrder>
): MarketOrder {
  return {
    region_id: REGION,
    location_id: STATION_A,
    is_corporation: false,
    volume_remain: 10,
    volume_total: 10,
    issued: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    duration: 90,
    range: 'region',
    min_volume: 1,
    ...fields,
  };
}

/** Tritanium (type_id 34) is in `public/data/types.json`, so name resolution never needs a live ESI call. */
// A ten-digit price: Price is the one column sized by its figure, not its header.
const SELL_ORDER = order({
  order_id: 301,
  type_id: 34,
  price: 1_234_567_890.5,
  is_buy_order: false,
});
const BUY_ORDER = order({
  order_id: 302,
  type_id: 34,
  price: 4.5,
  is_buy_order: true,
  range: 'region',
  min_volume: 100,
});

async function openMarketOrders(page: Page) {
  await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([SELL_ORDER, BUY_ORDER]),
    })
  );
  await page.route('https://esi.evetech.net/markets/*/history*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/universe/types/*', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"nf"}' })
  );
  await signInAndGoto(page, './market?section=browser');
  await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
  await page.getByRole('button', { name: 'Tritanium', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Tritanium' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Sell Orders' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Buy Orders' })).toBeVisible();
}

for (const viewport of WIDTHS) {
  test(`sell/buy order tables stay within the page at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openMarketOrders(page);
    await expectNoPageOverflow(page);

    // Buy is the wider table (it carries `range` on top of Sell's columns).
    // Since the order book rework it no longer scrolls sideways at all:
    // Location narrows first and, once the book's own column is too narrow
    // for the picked columns, the rows become two-line cards — so the
    // station and every figure stay in view without a horizontal scroller.
    for (const name of ['Sell Orders', 'Buy Orders']) {
      const scroller = page.getByRole('table', { name }).locator('xpath=..');
      const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(scrollWidth, name).toBeLessThanOrEqual(clientWidth);
    }
  });
}
