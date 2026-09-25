/**
 * Contracts History's detail opener on a phone (issue #1641).
 *
 * The History table has no row click: the Type/title button in each stacked
 * card's first line is the only visible way to open a contract's detail. A
 * bare text button is one line tall (~16px), well under the 44px touch floor;
 * the button now takes the touch tier below `md` and reverts to its one-line
 * height from `md` up. jsdom lays nothing out, so only a real render can pin it.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const TOUCH_TARGET_PX = 44;

const DAY_MS = 24 * 60 * 60 * 1000;

function contract(id: number, type: string, title: string) {
  return {
    contract_id: id,
    issuer_id: 1,
    issuer_corporation_id: 2,
    assignee_id: 0,
    acceptor_id: 0,
    type,
    status: 'outstanding',
    for_corporation: false,
    availability: 'public',
    date_issued: new Date(Date.now() - DAY_MS).toISOString(),
    date_expired: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    title,
    price: 1_000_000,
  };
}

const CONTRACTS = [
  contract(9001, 'courier', ''),
  contract(9002, 'auction', ''),
  contract(
    9003,
    'item_exchange',
    'A deliberately long forty-character title that wraps onto a second line on a phone'
  ),
];

test.describe('contracts history — detail opener', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndGoto(page);
    // Opening a detail fetches its items, which the list's `contracts*` glob
    // doesn't cover (`*` stops at a `/`): unmocked, whichever contract sorts
    // first (the three tie on issue date) could reach the real ESI.
    await page.route(
      `https://esi.evetech.net/characters/${CHARACTER_ID}/contracts/*/items*`,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.route(`https://esi.evetech.net/characters/${CHARACTER_ID}/contracts*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CONTRACTS),
      })
    );
  });

  test.describe('at 390px', () => {
    test.use({ viewport: PHONE });

    test('every opener meets the 44px touch floor and opens the detail', async ({ page }) => {
      await page.goto('./contracts/history');
      const table = page.getByRole('table').first();
      const openers = table.locator('tbody tr td:first-child button');
      await expect(openers).toHaveCount(CONTRACTS.length);

      for (const opener of await openers.all()) {
        const box = await opener.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
      }

      await openers.first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
    });
  });

  test.describe('at 900px', () => {
    test.use({ viewport: { width: 900, height: 800 } });

    test('the opener stays one text line tall', async ({ page }) => {
      await page.goto('./contracts/history');
      const openers = page.getByRole('table').first().locator('tbody tr td:first-child button');
      await expect(openers.first()).toBeVisible();
      const box = await openers.first().boundingBox();
      expect(box?.height ?? 0).toBeLessThan(TOUCH_TARGET_PX);
    });
  });
});
