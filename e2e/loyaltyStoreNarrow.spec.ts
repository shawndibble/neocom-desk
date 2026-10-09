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

for (const width of [390, 1024, 1280]) {
  test(`the header and list panel meta do not overlap or overflow at ${width}px (issue #3117)`, async ({
    page,
  }) => {
    await mockLoyaltyOffers(page);
    await signInAndGoto(page, `./market/lp-store/${CORPORATION_ID}?affordableOnly=0`);
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('cell').filter({ hasText: /Tritanium|Pyerite/ })).toHaveCount(2);

    const header = page.getByRole('heading', { level: 1 }).locator('xpath=ancestor::header[1]');
    await expect(header.getByText('Offers shown')).toHaveCount(0);

    // Direct children of the header's meta row never sit on top of each other.
    const meta = page.getByRole('link', { name: 'Corporation info' }).locator('xpath=..');
    const boxes = await meta.locator('> *').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })
    );
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps =
          a.left < b.right - 1 &&
          b.left < a.right - 1 &&
          a.top < b.bottom - 1 &&
          b.top < a.bottom - 1;
        expect(overlaps).toBe(false);
      }
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // From md up the count rides the list panel's title line, clear of the export button.
    if (width >= 768) {
      const count = page.getByText(/^2 \/ 2 offers$/);
      await expect(count).toBeVisible();
      const panelHeader = count.locator('xpath=ancestor::header[1]');
      const title = panelHeader.getByRole('heading', { level: 2 });
      const [c, t, actions] = await Promise.all([
        count.boundingBox(),
        title.boundingBox(),
        panelHeader.getByRole('button').last().boundingBox(),
      ]);
      expect(Math.abs(c!.y + c!.height / 2 - (t!.y + t!.height / 2))).toBeLessThan(t!.height);
      if (actions) expect(c!.x + c!.width).toBeLessThanOrEqual(actions.x + 1);
    } else {
      await expect(page.getByText(/^2 \/ 2 offers$/)).toBeHidden();
    }
  });
}

for (const width of [390, 1024, 1280]) {
  test(`the list panel names the hub and price basis inside its header at ${width}px (issue #3118)`, async ({
    page,
  }) => {
    await mockLoyaltyOffers(page);
    await signInAndGoto(page, `./market/lp-store/${CORPORATION_ID}?affordableOnly=0`);
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('cell').filter({ hasText: /Tritanium|Pyerite/ })).toHaveCount(2);

    const readout = page.getByTestId('lp-basis-readout');
    await expect(readout).toHaveText('Jita · Sell');
    const panelHeader = readout.locator('xpath=ancestor::header[1]');
    const title = panelHeader.getByRole('heading', { level: 2 });
    const [r, t, h, actions] = await Promise.all([
      readout.boundingBox(),
      title.boundingBox(),
      panelHeader.boundingBox(),
      panelHeader.getByRole('button').last().boundingBox(),
    ]);
    // Inside the header, clear of the title and the export button.
    expect(r!.x).toBeGreaterThanOrEqual(h!.x - 1);
    expect(r!.x + r!.width).toBeLessThanOrEqual(h!.x + h!.width + 1);
    expect(r!.y).toBeGreaterThanOrEqual(h!.y - 1);
    expect(r!.y + r!.height).toBeLessThanOrEqual(h!.y + h!.height + 1);
    const apart = (a: { x: number; y: number; width: number; height: number }) =>
      r!.x + r!.width <= a.x + 1 ||
      a.x + a.width <= r!.x + 1 ||
      r!.y + r!.height <= a.y + 1 ||
      a.y + a.height <= r!.y + 1;
    expect(apart(t!)).toBe(true);
    if (actions) expect(apart(actions)).toBe(true);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
