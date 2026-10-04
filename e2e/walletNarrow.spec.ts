/**
 * Wallet Journal "Transactions →" link touch target (issue #1919): a bare
 * `text-xs` link in the Panel header `actions` (centred, so it does not
 * inherit the header's `min-h-11`) was ~14px tall. Fixed with
 * `inline-flex min-h-11 min-w-11 ... md:min-h-0 md:min-w-0`, the same
 * precedent as #1070 / #1077 / #1126.
 *
 * Also the journal's phone "Sort by" picker (issue #2521), below.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test('Journal "Transactions →" link meets the 44px touch floor at 390px, without overflow', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions →' });
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

test('Journal "Transactions →" link keeps its text-link height at 1280px', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions →' });
  await expect(link).toBeVisible();
  const height = await link.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(20);
});

test('Journal "Transactions →" link rests in the accent colour at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions →' });
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
 * Journal sort picker (issue #2521): the journal is sortable, but below `sm`
 * the stacked cards hide the header row and its sort buttons. `mobileSort`
 * adds the phone-only "Sort by" picker above the cards.
 */
test.describe('Journal sort picker', () => {
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
      // 15 digits: the long-value case must still fit the stacked card.
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
    await signInAndGoto(page);
    await page.route(
      (url) => url.pathname === `/characters/${CHARACTER_ID}/wallet/journal`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(JOURNAL),
        })
    );
  });

  test('journal has a phone sort picker at 390px that reorders the cards', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./wallet/journal');

    const firstCard = page
      .getByRole('table', { name: 'Journal' })
      .locator('tbody tr:not(.dt-spacer)')
      .first();
    await expect(firstCard).toContainText('Newest small gift');

    const sortBy = page.getByLabel('Sort by', { exact: true });
    await expect(sortBy).toBeAttached();
    await sortBy.selectOption({ label: 'Amount ↓' });
    await expect(sortBy.locator('option:checked')).toHaveText('Amount ↓');
    await expect(firstCard).toContainText('Middle huge payout');
    await expectNoPageOverflow(page);
  });

  test('no journal picker at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./wallet/journal');
    await expect(page.getByRole('columnheader', { name: /Amount/ })).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
  });
});
