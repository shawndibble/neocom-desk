import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, CORPORATION_NAME, SCOPES } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';
import { scopesForGroup } from '../src/esi/scopes';

const JOURNAL = [
  {
    id: 12,
    date: '2026-09-02T00:00:00Z',
    ref_type: 'corporate_reward_payout',
    description: 'Newest small payout',
    amount: 900,
    balance: 1000000,
  },
  {
    id: 11,
    date: '2026-09-01T00:00:00Z',
    ref_type: 'corporate_reward_payout',
    description: 'Older huge payout',
    amount: 123456789012345,
    balance: 123456789013245,
  },
];

const TRANSACTIONS = [
  {
    transaction_id: 5002,
    date: '2026-09-05T10:00:00Z',
    location_id: 60003760,
    type_id: 35,
    unit_price: 9,
    quantity: 2000,
    client_id: 90000002,
    is_buy: false,
    journal_ref_id: 7002,
  },
  {
    transaction_id: 5001,
    date: '2026-09-04T10:00:00Z',
    location_id: 60003760,
    type_id: 34,
    unit_price: 5,
    quantity: 1000,
    client_id: 90000001,
    is_buy: true,
    journal_ref_id: 7001,
  },
];

test.describe('Corp Wallet narrow tables', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://esi.evetech.net/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      const corp = `/corporations/${CORPORATION_ID}`;

      if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Director'] });
      if (path === `${corp}/wallets`) return json([{ division: 1, balance: 123456789013245 }]);
      if (path === `${corp}/divisions`) {
        return json({ wallet: [{ division: 1, name: 'Master Wallet' }] });
      }
      if (path === `${corp}/wallets/1/journal`) return json(JOURNAL);
      if (path === `${corp}/wallets/1/transactions` && !url.searchParams.has('from_id')) {
        return json(TRANSACTIONS);
      }
      if (path.startsWith(`${corp}/`)) return json([]);

      await route.fallback();
    });

    await signInAndGoto(page, './overview', [...SCOPES, ...scopesForGroup('corp')]);
    await expect(page.getByText(CORPORATION_NAME).first()).toBeVisible();
  });

  test('journal is day-grouped cards at 390px, sorted from the picker', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/wallet');

    await expect(page.getByRole('button', { name: 'Show all divisions' })).toBeHidden();
    const table = page.getByRole('table', { name: 'Journal' });
    const rows = table.locator('tbody tr[data-row-key]');
    await expect(rows.first()).toBeVisible();
    const firstAmount = rows.first().locator('td[data-label="Amount"]');
    await expect(firstAmount).toContainText('900');
    await expect(table.locator('.dt-group-header').first()).toContainText('EVE time');

    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('amount:desc');
    await expect(table.locator('.dt-group-header')).toHaveCount(0);
    await expect(firstAmount).toContainText('123,456,789,012,345');
    await expectNoPageOverflow(page);
  });

  test('journal shows its sort header at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./corp/wallet');
    await expect(page.getByRole('columnheader', { name: /Amount/ })).toBeVisible();
  });
});

const LONG_NAME = 'Division name that runs on to forty ch';

const WALLETS = [1, 2, 3, 4, 5, 6, 7].map((division) => ({
  division,
  balance: division === 2 ? 123_456_789_012_345.67 : division * 1_000_000,
}));

const NAMES = ['Master Wallet', LONG_NAME, 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'].map(
  (name, index) => ({ division: index + 1, name })
);

test.describe('Corp Wallet divisions panel (issue #2593)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://esi.evetech.net/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Director'] });
      if (path === `/corporations/${CORPORATION_ID}/wallets`) return json(WALLETS);
      if (path === `/corporations/${CORPORATION_ID}/divisions`) {
        return json({ wallet: NAMES, hangar: [] });
      }
      if (path.startsWith(`/corporations/${CORPORATION_ID}/`)) return json([]);

      await route.fallback();
    });

    await signInAndGoto(page, './overview', [...SCOPES, ...scopesForGroup('corp')]);
    await expect(page.getByText(CORPORATION_NAME).first()).toBeVisible();
  });

  test('folds to the selected division at 390px and unfolds to switch', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/wallet');

    const show = page.getByRole('button', { name: 'Show all divisions' });
    await expect(show).toBeVisible();
    await expect(page.getByText('Master Wallet')).toBeVisible();
    await expect(page.getByRole('button', { name: /Second/ })).toBeHidden();
    await expectNoPageOverflow(page);

    await show.click();
    await expect(page.getByRole('button', { name: /Second/ })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByRole('button', { name: /Second/ }).click();

    expect(new URL(page.url()).searchParams.get('division')).toBe('3');
    await expect(page.getByRole('button', { name: 'Show all divisions' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Third/ })).toBeHidden();
  });

  test('a long division name and 15-digit balance do not overflow', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/wallet?division=2');
    await expect(page.getByRole('button', { name: 'Show all divisions' })).toBeVisible();
    await expect(page.getByText(LONG_NAME)).toBeVisible();
    await expect(page.getByText(/123,456,789,012,345/)).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test('shows every division and no caret at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./corp/wallet');
    await expect(page.getByRole('button', { name: /Sixth/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show all divisions' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Hide divisions' })).toBeHidden();
  });
});
