/**
 * Corp Wallet on a phone (issue #2521): the Journal (shared with `/wallet`)
 * and the Transactions ledger are both compare tables, so both stay plain
 * tables with their sort buttons in the header and low-value columns hidden
 * (Journal: Description, Balance; Transactions: Side, Unit price).
 *
 * `/corp/wallet` needs a wallet-reading role (`canReadWallet` in
 * `engine/corpRoles.ts`), so the shared mock's default `{}` roles response is
 * overridden to `['Accountant']`, and the JWT carries the `corp` scope group
 * on top of the base fixture grant.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, CORPORATION_NAME, SCOPES } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';
import { scopesForGroup } from '../src/esi/scopes';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

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
    // 15 digits: the long-value case must still fit the stacked card.
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
    // The `corp` scope group opens every corp capability, and
    // `app/prefetch.ts` warms all of them at boot; anything this spec doesn't
    // seed under `/corporations/{id}/` answers empty.
    await page.route('https://esi.evetech.net/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      const corp = `/corporations/${CORPORATION_ID}`;

      if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Accountant'] });
      if (path === `${corp}/wallets`) return json([{ division: 1, balance: 123456789013245 }]);
      if (path === `${corp}/divisions`) {
        return json({ wallet: [{ division: 1, name: 'Master Wallet' }] });
      }
      if (path === `${corp}/wallets/1/journal`) return json(JOURNAL);
      // Cursored by `from_id`: a follow-up page must come back empty or the walk never ends.
      if (path === `${corp}/wallets/1/transactions` && !url.searchParams.has('from_id')) {
        return json(TRANSACTIONS);
      }
      if (path.startsWith(`${corp}/`)) return json([]);

      await route.fallback();
    });

    // `/corp/wallet` reads the corporation id only from Dexie, where the
    // public-info read (`stores/publicInfo.ts` -> `recordCharacterCorporation`)
    // writes it; the seeded character row has none and this page never makes
    // that read itself, so with no id every corp read stays parked on "nothing
    // cached". Overview's `CharacterHeader` makes it: its corporation name only
    // shows once the id has been recorded.
    await signInAndGoto(page, './overview', [...SCOPES, ...scopesForGroup('corp')]);
    await expect(page.getByText(CORPORATION_NAME).first()).toBeVisible();
  });

  test('journal is a plain table at 390px (no sort picker), sorted from its header', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/wallet');

    // One division: nothing to fold, so no caret.
    await expect(page.getByRole('button', { name: 'Show all divisions' })).toBeHidden();
    // The shared journal table (also `/wallet`): Description and Balance are
    // shed below `sm`, the header sort buttons stay.
    const table = page.getByRole('table', { name: 'Journal' });
    const firstAmount = table
      .locator('tbody tr:not(.dt-spacer)')
      .first()
      .locator('td[data-label="Amount"]');
    await expect(firstAmount).toContainText('900');
    await expect(table.getByRole('columnheader', { name: /Description/ })).toBeHidden();

    const amountHeader = table.getByRole('button', { name: /Amount/ });
    await amountHeader.click();
    if (!(await firstAmount.textContent())?.includes('123,456,789,012,345')) {
      await amountHeader.click();
    }
    await expect(firstAmount).toContainText('123,456,789,012,345');
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
    await expectNoPageOverflow(page);
  });

  test('transactions stays a plain table at 390px, sortable by header', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/wallet?view=transactions');

    const table = page.getByRole('table', { name: 'Transactions' });
    await expect(table).toBeVisible();
    // A table, not cards: the header row and its sort buttons stay, and the
    // low-value Side / Unit price columns drop out.
    await expect(table.getByRole('columnheader', { name: /Total/ })).toBeVisible();
    const headers = await table.evaluate((el) =>
      [...el.querySelectorAll('thead th')]
        .filter((th) => getComputedStyle(th).display !== 'none')
        .map((th) => (th.textContent ?? '').trim())
    );
    expect(headers.some((h) => h.startsWith('Item'))).toBe(true);
    expect(headers.some((h) => h.startsWith('Total'))).toBe(true);
    expect(headers.some((h) => h.startsWith('Unit price'))).toBe(false);
    expect(headers.some((h) => h.startsWith('Side'))).toBe(false);
    const rowDisplay = await table
      .locator('tbody tr:not(.dt-spacer)')
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(rowDisplay).toBe('table-row');
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
    await table.getByRole('columnheader', { name: /Total/ }).getByRole('button').click();
    await expect(page).toHaveURL(/sort=/);
    await expectNoPageOverflow(page);
  });

  test('no picker at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./corp/wallet');
    await expect(page.getByRole('columnheader', { name: /Amount/ })).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
  });
});

/**
 * Divisions panel (issue #2593): seven division cards used to push the Journal /
 * Transactions switch below the fold, so below `sm` the panel folds to the
 * selected division's name and balance; the caret lists every division and
 * picking one selects it and folds again. At 1280px nothing changes.
 */
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

      if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Accountant'] });
      if (path === `/corporations/${CORPORATION_ID}/wallets`) return json(WALLETS);
      if (path === `/corporations/${CORPORATION_ID}/divisions`) {
        return json({ wallet: NAMES, hangar: [] });
      }
      if (path.startsWith(`/corporations/${CORPORATION_ID}/`)) return json([]);

      await route.fallback();
    });

    // The corporation id is recorded by Overview's public-info read; see the
    // sort-picker describe above.
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

    const switchBox = await page.getByRole('group', { name: 'Wallet view' }).boundingBox();
    expect(switchBox).not.toBeNull();
    expect(switchBox!.y + switchBox!.height).toBeLessThanOrEqual(PHONE.height);

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
