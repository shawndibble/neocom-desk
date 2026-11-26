import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

function makeTransactions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    transaction_id: 5001 + i,
    date: new Date(Date.UTC(2026, 8, 20, 12) - i * 3_600_000).toISOString(),
    location_id: 60003760,
    type_id: 34,
    unit_price: 5.68 + i,
    quantity: 3_400_000 - i,
    client_id: 90000002,
    is_buy: i % 3 === 0,
    journal_ref_id: 7001 + i,
  }));
}

async function mockTransactions(page: Page, count = 1) {
  const body = JSON.stringify(makeTransactions(count));
  await page.route(
    (url) => url.pathname === `/characters/${CHARACTER_ID}/wallet/transactions`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'X-Pages': '1' },
        body,
      })
  );
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

test.describe('Market history ledger at 390px', () => {
  test.beforeEach(async ({ page }) => {
    await mockTransactions(page);
    await page.setViewportSize(PHONE);
    await signInAndGoto(page);
  });

  test('transactions: date, item, quantity, price and total stay; side and margin go', async ({
    page,
  }) => {
    await page.goto('./market/history');
    await expectPhoneTable(
      page,
      'Transactions',
      ['Date', 'Item', 'Qty', 'Unit price', 'Total'],
      ['Side', 'Margin']
    );
  });
});

for (const width of [360, 390, 414]) {
  for (const count of [30, 200]) {
    test(`Item keeps 110px at ${width}px with ${count} rows`, async ({ page }) => {
      await mockTransactions(page, count);
      await page.setViewportSize({ width, height: 844 });
      await signInAndGoto(page);
      await page.goto('./market/history');
      const table = page.getByRole('table', { name: 'Transactions' });
      await expect(table.locator('tbody tr[data-row-key]').first()).toBeVisible({
        timeout: 15_000,
      });
      const item = await table.getByRole('columnheader', { name: 'Item' }).boundingBox();
      expect(item?.width ?? 0).toBeGreaterThanOrEqual(110);
      await expectNoPageOverflow(page);
    });
  }
}
