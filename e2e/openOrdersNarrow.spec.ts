import type { Locator, Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';
import type { MarketOrder } from '../src/esi/endpoints';

const TABLET = { width: 768, height: 900 };

const REGION = 10000002;
const STATION_A = 60003760;

function order(
  fields: Pick<MarketOrder, 'order_id' | 'type_id' | 'price'> & Partial<MarketOrder>
): MarketOrder {
  return {
    region_id: REGION,
    location_id: STATION_A,
    is_buy_order: false,
    is_corporation: false,
    volume_remain: 10,
    volume_total: 10,
    issued: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    duration: 90,
    range: 'station',
    ...fields,
  };
}

const HEALTHY_ORDER = order({
  order_id: 103,
  type_id: 35,
  price: 700,
  volume_remain: 20,
  volume_total: 20,
});
const EXPIRING_ORDER = order({
  order_id: 201,
  type_id: 36,
  price: 300,
  issued: new Date().toISOString(),
  duration: 5,
  volume_remain: 5,
  volume_total: 5,
});

async function seedOpenOrders(page: Page): Promise<void> {
  await page.route(`**/characters/${CHARACTER_ID}/orders`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([HEALTHY_ORDER, EXPIRING_ORDER]),
    })
  );
}

const height = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().height);

test.describe('Open Orders — fix list at narrow widths', () => {
  test('the segments and the healthy fold meet the 36px floor at 390px, with no sideways scroll', async ({
    page,
  }) => {
    await seedOpenOrders(page);
    await signInAndGoto(page);
    await page.setViewportSize(PHONE);
    await page.goto('./market/orders');

    const needsYou = page.getByRole('button', { name: 'Needs you (1)', exact: true });
    await expect(needsYou).toHaveAttribute('aria-pressed', 'true');
    const show = page.getByRole('button', { name: 'Show', exact: true });
    await expect(show).toBeVisible();
    expect(await height(page.getByRole('group', { name: 'Which orders' }))).toBeGreaterThanOrEqual(
      36
    );
    expect(await height(show)).toBeGreaterThanOrEqual(36);
    await expectNoPageOverflow(page);
  });

  test('every optional column on at 768px: the table scrolls in its own frame, never the page', async ({
    page,
  }) => {
    await seedOpenOrders(page);
    await signInAndGoto(page, './overview', undefined, [
      {
        key: 'openOrdersOptionalColumns',
        value: ['price', 'stationCheapest', 'floor', 'remaining', 'expires'],
      },
    ]);
    await page.setViewportSize(TABLET);
    await page.goto('./market/orders');

    const table = page.getByRole('table', { name: 'Orders that need you' });
    await expect(table.getByRole('columnheader', { name: /Never sell below/ })).toBeVisible();
    await expectNoPageOverflow(page);
  });
});

async function mockOrderDetailDependencies(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/markets/*/history*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/route/*/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ route: [30000142] }),
    })
  );
}

test.describe('Open Orders — compact phone list (#1429)', () => {
  test.beforeEach(async ({ page }) => {
    await seedOpenOrders(page);
    await mockOrderDetailDependencies(page);
    await signInAndGoto(page);
  });

  test('the expiring order renders as a 36px+ tap row that opens its detail modal', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./market/orders');

    const row = page.getByRole('button', { name: /^Mexallon/ });
    await expect(row).toBeVisible();
    expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
      36
    );

    await row.click();
    await expect(page.getByRole('dialog', { name: /Mexallon/ })).toBeVisible();
  });
});

test.describe('Open Orders — filter selects are distinguishable (#1744)', () => {
  test('the expiry and ISK-tied-up selects read differently at 390px', async ({ page }) => {
    await seedOpenOrders(page);
    await signInAndGoto(page);
    await page.setViewportSize(PHONE);
    await page.goto('./market/orders');

    await page.getByRole('button', { name: /^Filters/ }).click();
    const expiry = page.getByRole('combobox', { name: 'Expires within' });
    const tied = page.getByRole('combobox', { name: 'ISK tied up over' });
    await expect(expiry).toHaveText('Any expiry');
    await expect(tied).toHaveText('Any size');
    for (const box of [expiry, tied]) {
      const rect = await box.evaluate((el) => el.getBoundingClientRect());
      expect(rect.right).toBeLessThanOrEqual(PHONE.width);
    }
  });
});
