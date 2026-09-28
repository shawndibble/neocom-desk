/**
 * Loyalty Store's back-to-Wallet link (issue #1095): it was a bare
 * `inline-block text-xs text-accent hover:underline` anchor — text with no box
 * of its own, so on a phone it was a ~16px-tall tap target sitting above a
 * full page of controls that all size themselves from the shared control
 * scale.
 *
 * Asserted on the rendered bounding box, not on the class string: the class
 * name only proves what was typed, while the box proves what the cascade
 * actually produced at that viewport. Width is asserted too — the link's
 * parent is a `flex flex-col`, whose default `align-items: stretch` pulls an
 * `inline-flex` control out to the full page unless it opts out.
 *
 * The back-link tests below render only the route's chrome (header, back
 * link, empty state) with no offers at all, so the empty LP fixtures in
 * `support/mockEsi.ts` are enough for them; the phone-sort-control test
 * further down seeds its own offers via `mockLoyaltyOffers`.
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

test('the back-to-Wallet link is a full sm-tier control (36px) at 390px', async ({ page }) => {
  await signInAndGoto(page, `./wallet/loyalty/${CORPORATION_ID}`);
  await page.setViewportSize(PHONE);

  const back = page.getByRole('link', { name: /Loyalty Points/ });
  await expect(back).toBeVisible();

  const box = await back.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(box.height).toBeGreaterThanOrEqual(36);
  // Intrinsic width, not the stretched-to-the-viewport bar the flex column
  // would otherwise produce.
  expect(box.width).toBeLessThan(PHONE.width / 2);
});

test('the back-to-Wallet link drops to the compact tier at and above md (1280px)', async ({
  page,
}) => {
  await signInAndGoto(page, `./wallet/loyalty/${CORPORATION_ID}`);
  await page.setViewportSize(DESKTOP);

  const back = page.getByRole('link', { name: /Loyalty Points/ });
  await expect(back).toBeVisible();

  // `h-7` (28px), pinned to a narrow band rather than a loose "< 36": a wide
  // upper bound would not notice the touch-tier height leaking onto desktop.
  const height = await back.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(24);
  expect(height).toBeLessThanOrEqual(32);
});

test('a phone sort control changes the Offers table order at 390px (issue #2174)', async ({
  page,
}) => {
  await mockLoyaltyOffers(page);
  // `affordableOnly` defaults true and the fixture pilot has 0 LP, which
  // would otherwise filter both fixture offers out of `filteredRows`.
  await signInAndGoto(page, `./wallet/loyalty/${CORPORATION_ID}?affordableOnly=0`);
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
  await signInAndGoto(page, `./wallet/loyalty/${CORPORATION_ID}?affordableOnly=0`);
  await page.setViewportSize(DESKTOP);

  const itemCells = page.getByRole('cell').filter({ hasText: /Tritanium|Pyerite/ });
  await expect(itemCells).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toBeHidden();
});
