/**
 * Loyalty Store at phone width: the phone sort control (issue #2174) and the
 * corporation picker's fit (issue #2321).
 *
 * The picker-fit test renders only the route's chrome with no offers, so the
 * empty LP fixtures in `support/mockEsi.ts` are enough; the phone-sort-control
 * test seeds its own offers via `mockLoyaltyOffers`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CORPORATION_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * Tritanium (34) and Pyerite (35): both resolve their names from the app's
 * own bundled `public/data/types.json` catalogue, so the offer rows render
 * without needing an ESI-name mock (see marketOrderBookOverflow.spec.ts).
 */
const OFFERS = [
  { isk_cost: 0, lp_cost: 1000, offer_id: 1, quantity: 1, required_items: [], type_id: 34 },
  { isk_cost: 0, lp_cost: 2000, offer_id: 2, quantity: 1, required_items: [], type_id: 35 },
];

async function mockLoyaltyOffers(page: Page) {
  await page.route(`https://esi.evetech.net/loyalty/stores/${CORPORATION_ID}/offers/`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFFERS) })
  );
  // The Offers rows only render once the LP Store's market snapshot resolves
  // (useLoyaltyStoreOffers gates on `catalog && snapshot`) — an empty order
  // book is enough, the test only cares about item names and sort order.
  await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/markets/*/history*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

test('a phone sort control changes the Offers table order at 390px (issue #2174)', async ({
  page,
}) => {
  await mockLoyaltyOffers(page);
  // `affordableOnly` defaults true and the fixture pilot has 0 LP, which
  // would otherwise filter both fixture offers out of `filteredRows`.
  await signInAndGoto(page, `./market/lp-store/${CORPORATION_ID}?affordableOnly=0`);
  await page.setViewportSize(PHONE);

  const itemCells = page.getByRole('cell').filter({ hasText: /Tritanium|Pyerite/ });
  await expect(itemCells).toHaveCount(2);

  const sortSelect = page.getByRole('combobox', { name: 'Sort by' });
  await expect(sortSelect).toBeVisible();

  // Alphabetically, Pyerite sorts before Tritanium — pin the expected order
  // rather than just asserting "something changed", so this proves the
  // Item column specifically drove the reorder, not an unrelated re-render.
  await sortSelect.selectOption('item:asc');
  await expect
    .poll(() => itemCells.allTextContents())
    .toEqual([expect.stringContaining('Pyerite'), expect.stringContaining('Tritanium')]);

  await sortSelect.selectOption('item:desc');
  await expect
    .poll(() => itemCells.allTextContents())
    .toEqual([expect.stringContaining('Tritanium'), expect.stringContaining('Pyerite')]);
});

test('the phone sort control stays hidden at and above md (768px) (issue #2174)', async ({
  page,
}) => {
  await mockLoyaltyOffers(page);
  await signInAndGoto(page, `./market/lp-store/${CORPORATION_ID}?affordableOnly=0`);
  await page.setViewportSize(DESKTOP);

  const itemCells = page.getByRole('cell').filter({ hasText: /Tritanium|Pyerite/ });
  await expect(itemCells).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toBeHidden();
});

test('the header corporation picker fits a 390px phone without horizontal scroll (issue #2321)', async ({
  page,
}) => {
  async function expectPickerFits() {
    const picker = page.getByRole('button', { name: /LP Store corporation/ });
    await expect(picker).toBeVisible();
    await picker.click();
    // The popover opens too: both it and the closed select stay on screen.
    const popover = page.getByRole('dialog', { name: 'LP Store corporation' });
    await expect(popover).toBeVisible();
    for (const el of [picker, popover]) {
      const box = await el.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(PHONE.width);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
  }

  await signInAndGoto(page, './market/lp-store');
  await page.setViewportSize(PHONE);
  await expectPickerFits();

  await page.goto(`./market/lp-store/${CORPORATION_ID}`);
  await expectPickerFits();
});
