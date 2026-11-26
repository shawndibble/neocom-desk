import type { Page } from '@playwright/test';
import { test, expect, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';
import type { MarketOrder } from '../src/esi/endpoints';

const WIDTHS: { width: number; height: number; bracket?: boolean }[] = [
  { width: 1024, height: 768 },
  DESKTOP,
  { width: 1340, height: 900, bracket: true },
  { width: 1368, height: 900, bracket: true },
  { width: 1400, height: 900, bracket: true },
  { width: 1440, height: 900, bracket: true },
  { width: 1500, height: 900 },
  { width: 1560, height: 900 },
];

const REGION = 10000002;
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

    if (viewport.bracket) {
      for (const name of ['Sell Orders', 'Buy Orders']) {
        const row = page.locator(`table[aria-label="${name}"] tbody tr`).first();
        const more = await row.getByRole('button', { name: /^More actions/ }).boundingBox();
        const card = await page.getByRole('region', { name }).boundingBox();
        expect(more, name).not.toBeNull();
        expect(more!.x + more!.width, name).toBeLessThanOrEqual(card!.x + card!.width);
      }
    }

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
