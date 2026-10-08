/**
 * Wallet Journal "Transactions" link touch target (issue #1919): a bare
 * `text-xs` link in the Panel header `actions` (centred, so it does not
 * inherit the header's `min-h-11`) was ~14px tall. Fixed with
 * `inline-flex min-h-11 min-w-11 ... md:min-h-0 md:min-w-0`, the same
 * precedent as #1070 / #1077 / #1126.
 *
 * Also the journal as a plain phone table (was #2521's "Sort by" picker), below.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test('Journal "Transactions" link meets the 44px touch floor at 390px, without overflow', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions' });
  await expect(link).toBeVisible();

  const box = await link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { height: r.height, right: r.right };
  });
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.right).toBeLessThanOrEqual(PHONE.width);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // The journal's export button shares the header row.
  await expect(page.getByRole('button', { name: 'Export Journal' })).toBeVisible();
});

test('Journal "Transactions" link keeps its text-link height at 1280px', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions' });
  await expect(link).toBeVisible();
  const height = await link.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(20);
});

test('Journal "Transactions" link rests in the accent colour at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions' });
  await expect(link).toBeVisible();
  const { linkColor, accentColor } = await link.evaluate((el) => {
    const probe = document.createElement('span');
    probe.className = 'text-accent';
    document.body.appendChild(probe);
    const accentColor = getComputedStyle(probe).color;
    probe.remove();
    return { linkColor: getComputedStyle(el).color, accentColor };
  });
  expect(linkColor).toBe(accentColor);
});

/**
 * Journal on a phone: a ledger read across columns, so a plain table
 * (DESIGN.md §6c Restraint) with Balance off by default (`phoneOffByDefault`)
 * and the header sort buttons still on screen.
 */
test.describe('Journal phone table', () => {
  const JOURNAL = [
    {
      id: 3,
      date: '2026-09-03T00:00:00Z',
      ref_type: 'player_donation',
      description: 'Newest small gift',
      amount: 100,
      balance: 1000,
    },
    {
      id: 2,
      date: '2026-09-02T00:00:00Z',
      ref_type: 'player_donation',
      description: 'Middle huge payout',
      // 15 digits: the long-value case must still fit the table cell.
      amount: 123456789012345,
      balance: 123456789013245,
    },
    {
      id: 1,
      date: '2026-09-01T00:00:00Z',
      ref_type: 'player_donation',
      description: 'Oldest outgoing',
      amount: -5000000,
      balance: 900,
    },
  ];

  test.beforeEach(async ({ page }) => {
    // Before signing in: boot prefetch reads the journal, and an empty answer
    // from the shared mock would be cached as fresh.
    await page.route(
      (url) => url.pathname === `/characters/${CHARACTER_ID}/wallet/journal`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(JOURNAL),
        })
    );
    await signInAndGoto(page);
  });

  test('journal is a plain table at 390px, sorted from its header, without the sort picker', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./wallet/journal');

    const table = page.getByRole('table', { name: 'Journal' });
    const firstRow = table.locator('tbody tr:not(.dt-spacer)').first();
    await expect(firstRow).toBeVisible();
    expect(await firstRow.evaluate((tr) => getComputedStyle(tr).display)).toBe('table-row');

    // Balance is shed; Date, Type, Description and Amount stay.
    await expect(table.getByRole('columnheader', { name: /Description/ })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: /Balance/ })).toBeHidden();
    await expect(table.getByRole('columnheader', { name: /Amount/ })).toBeVisible();

    const amounts = () =>
      table.locator('tbody tr:not(.dt-spacer) td[data-label="Amount"]').allTextContents();
    const before = await amounts();
    expect(before).toHaveLength(3);
    // Newest first by default: the 100 ISK gift leads. Sorting by Amount moves it.
    await table.getByRole('button', { name: /Amount/ }).click();
    await expect.poll(async () => (await amounts())[0]).not.toBe(before[0]);
    await expectNoPageOverflow(page);
  });

  test('journal at 1280px shows every column', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./wallet/journal');
    await expect(page.getByRole('columnheader', { name: /Amount/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Description/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Balance/ })).toBeVisible();
  });
});
