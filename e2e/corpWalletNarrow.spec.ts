/**
 * Corp Wallet on a phone (issue #2593): seven division cards used to push the
 * Journal / Transactions switch below the fold, so below `sm` the Divisions
 * panel folds to the selected division's name and balance. A tap on the caret
 * lists every division; picking one selects it and folds the panel again.
 * At 1280px the panel is unchanged: every division visible, no caret.
 */
import { test, expect } from './support/testBase';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { makeAccessToken } from './support/mockSso';
import { expectNoPageOverflow } from './support/overflow';
import { scopesForGroup } from '../src/esi/scopes';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const LONG_NAME = 'Division name that runs on to forty ch';

const WALLETS = [1, 2, 3, 4, 5, 6, 7].map((division) => ({
  division,
  balance: division === 1 ? 123_456_789_012_345.67 : division * 1_000_000,
}));

const NAMES = ['Master Wallet', LONG_NAME, 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'].map(
  (name, index) => ({ division: index + 1, name })
);

test.describe('Corp Wallet divisions panel', () => {
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

    // The real login flow, not `signInAndGoto`'s seed: only a login reads the
    // public-info affiliation that tells the app which corporation to read.
    await page.route('https://login.eveonline.com/v2/oauth/token', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: makeAccessToken([...SCOPES, ...scopesForGroup('corp')]),
          token_type: 'Bearer',
          expires_in: 1199,
          refresh_token: 'fake-refresh',
        }),
      });
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
    await expect(page).toHaveURL(/\/overview$/);
    // The Corp board is what records which corporation the Character is in;
    // wait for that write so a later full reload of /corp/wallet can read it.
    await page.goto('./corp');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number | null>((resolve) => {
              const open = indexedDB.open('neocom');
              open.onsuccess = () => {
                const get = open.result
                  .transaction('characters')
                  .objectStore('characters')
                  .getAll();
                get.onsuccess = () => resolve(get.result[0]?.corporationId ?? null);
              };
            })
        )
      )
      .toBe(CORPORATION_ID);
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
    await expectNoPageOverflow(page);
    await page.goto('./corp/wallet?division=1');
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
