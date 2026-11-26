import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const BASELINE_TOLERANCE_PX = 2;

const TABLE_NAME = 'Journal';

const JOURNAL = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  date: `2026-09-0${index + 1}T00:00:00Z`,
  ref_type: index % 2 === 0 ? 'bounty_prizes' : 'player_donation',
  description: `E2E journal entry ${index + 1}`,
  amount: 1_000_000 * (index + 1),
  balance: 50_000_000 + index,
}));

async function signInToJournal(page: import('@playwright/test').Page) {
  await page.route(
    (url) => url.pathname === `/characters/${CHARACTER_ID}/wallet/journal`,
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JOURNAL) })
  );
  await signInAndGoto(page, './wallet/journal');
}

async function firstRow(page: import('@playwright/test').Page) {
  const row = page
    .getByRole('table', { name: TABLE_NAME })
    .locator('tbody tr[data-row-key]')
    .first();
  await expect(row).toBeVisible();
  return row;
}

async function firstRowCellTops(page: import('@playwright/test').Page) {
  const row = await firstRow(page);
  const item = row.locator('td').nth(0);
  const quantity = row.locator('td').nth(1);
  await expect(item).toBeVisible();
  await expect(quantity).toBeVisible();
  const itemBox = await item.boundingBox();
  const quantityBox = await quantity.boundingBox();
  if (!itemBox || !quantityBox) throw new Error('DataTable cells have no layout box');
  return { item: itemBox.y, quantity: quantityBox.y };
}

test.describe('production bundle — phone width', () => {
  test.use({ viewport: PHONE });

  test('the page does not scroll sideways and the table has collapsed', async ({ page }) => {
    await signInToJournal(page);
    await expect(page.getByRole('table', { name: TABLE_NAME })).toBeVisible();

    const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
      const root = document.documentElement;
      const limit = root.clientWidth;
      const offenders = Array.from(document.body.querySelectorAll('*'))
        .map((element) => ({ element, right: element.getBoundingClientRect().right }))
        .filter((entry) => entry.right > limit + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 5)
        .map(({ element, right }) => {
          const name = element.getAttribute('aria-label') ?? element.id;
          return `${element.tagName.toLowerCase()}${name ? `[${name}]` : ''} @ ${Math.round(right)}px`;
        });
      return { scrollWidth: root.scrollWidth, clientWidth: limit, offenders };
    });
    expect(
      scrollWidth,
      `Page is ${scrollWidth}px wide in a ${clientWidth}px viewport. Widest elements: ${
        offenders.join(', ') || '(none individually past the edge)'
      }`
    ).toBeLessThanOrEqual(clientWidth);

    const row = await firstRow(page);
    expect(await row.evaluate((tr) => getComputedStyle(tr).display)).not.toBe('table-row');
  });
});

test.describe('production bundle — desktop width', () => {
  test.use({ viewport: DESKTOP });

  test('the same two cells share a baseline as a real table row', async ({ page }) => {
    await signInToJournal(page);
    await expect(page.getByRole('table', { name: TABLE_NAME })).toBeVisible();

    const row = await firstRow(page);
    expect(await row.evaluate((tr) => getComputedStyle(tr).display)).toBe('table-row');
    const tops = await firstRowCellTops(page);
    expect(Math.abs(tops.quantity - tops.item)).toBeLessThanOrEqual(BASELINE_TOLERANCE_PX);
  });
});
