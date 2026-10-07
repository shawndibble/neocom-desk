/**
 * Market › History (ended orders) and Transactions at 390px: plain tables, not
 * cards or a bespoke list (DESIGN.md §6c Restraint). Each is a ledger read
 * across columns, so it keeps real columns, pins the item (`stickyStart`),
 * sheds its low-value columns (`phoneHidden`) and scrolls sideways inside its
 * own wrapper, never the page. The default-sort column stays visible.
 *
 * Playwright rather than jsdom: `max-sm:hidden`, `position: sticky` and the
 * page's scrollWidth are layout a real engine has to compute.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };

const ORDER_HISTORY = [
  {
    order_id: 9001,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_buy_order: false,
    price: 5.68,
    volume_remain: 0,
    volume_total: 3_400_000,
    issued: '2026-09-20T12:00:00Z',
    duration: 90,
    range: 'station',
    state: 'expired',
  },
];

const TRANSACTIONS = [
  {
    transaction_id: 5001,
    date: '2026-09-20T12:00:00Z',
    location_id: 60003760,
    type_id: 34,
    unit_price: 5.68,
    quantity: 3_400_000,
    client_id: 90000002,
    is_buy: false,
    journal_ref_id: 7001,
  },
];

async function mockLedgers(page: Page) {
  // Before signing in: boot prefetch reads these, and an empty answer from the
  // shared mock would be cached as fresh.
  for (const [suffix, body] of [
    ['orders/history', ORDER_HISTORY],
    ['wallet/transactions', TRANSACTIONS],
  ] as const) {
    await page.route(
      (url) => url.pathname === `/characters/${CHARACTER_ID}/${suffix}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'X-Pages': '1' },
          body: JSON.stringify(body),
        })
    );
  }
}

async function expectPhoneTable(page: Page, label: string, shown: string[], hidden: string[]) {
  const table = page.getByRole('table', { name: label });
  const row = table.locator('tbody tr[data-row-key]').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  expect(await row.evaluate((tr) => getComputedStyle(tr).display)).toBe('table-row');
  for (const column of shown) await expect(row.locator(`td[data-label="${column}"]`)).toBeVisible();
  for (const column of hidden) await expect(row.locator(`td[data-label="${column}"]`)).toBeHidden();
  const itemPosition = await row
    .locator('td[data-label="Item"]')
    .evaluate((td) => getComputedStyle(td).position);
  expect(itemPosition).toBe('sticky');
  await expect(table.getByRole('button', { name: /^More actions/ })).toHaveCount(0);
  await expectNoPageOverflow(page);
}

test.describe('Market history ledgers at 390px', () => {
  test.beforeEach(async ({ page }) => {
    await mockLedgers(page);
    await page.setViewportSize(PHONE);
    await signInAndGoto(page);
  });

  test('ended orders: item, price, remaining and issued stay; side and state go', async ({
    page,
  }) => {
    await page.goto('./market/history');
    await expectPhoneTable(
      page,
      'History',
      ['Item', 'Price', 'Remaining', 'Issued'],
      ['Side', 'State']
    );
  });

  test('transactions: date, item, quantity, price and total stay; side and margin go', async ({
    page,
  }) => {
    await page.goto('./market/history/transactions');
    await expectPhoneTable(
      page,
      'Transactions',
      ['Date', 'Item', 'Qty', 'Unit price', 'Total'],
      ['Side', 'Margin']
    );
  });
});
