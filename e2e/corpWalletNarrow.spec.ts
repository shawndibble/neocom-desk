/**
 * Corp Wallet on a phone (issue #2521): the Journal and Transactions tables
 * are both sortable, but below `sm` the stacked cards hide the header row and
 * every sort button with it. `mobileSort` adds the phone-only "Sort by"
 * picker above the cards, as `e2e/corpMembersNarrow.spec.ts` checks for the
 * roster.
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

test.describe('Corp Wallet sort pickers', () => {
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

  test('journal has a phone sort picker at 390px that reorders the cards', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/wallet');

    const firstCard = page
      .getByRole('table', { name: 'Journal' })
      .locator('tbody tr:not(.dt-spacer)')
      .first();
    await expect(firstCard).toContainText('Newest small payout');

    const sortBy = page.getByLabel('Sort by', { exact: true });
    await sortBy.selectOption({ label: 'Amount ↓' });
    await expect(sortBy.locator('option:checked')).toHaveText('Amount ↓');
    await expect(firstCard).toContainText('Older huge payout');
    await expectNoPageOverflow(page);
  });

  test('transactions has a phone sort picker at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/wallet?view=transactions');

    await expect(page.getByRole('table', { name: 'Transactions' })).toBeVisible();
    const sortBy = page.getByLabel('Sort by', { exact: true });
    await sortBy.selectOption({ label: 'Total ↑' });
    await expect(sortBy.locator('option:checked')).toHaveText('Total ↑');
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
