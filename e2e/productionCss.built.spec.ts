/**
 * Layout invariants asserted against the **built** bundle (#205).
 *
 * Every other spec here runs against the Vite dev server, so nothing in CI
 * ever rendered production CSS: `validate` builds but only checks the exit
 * code. A rule dropped by Tailwind's `@source` scanning, a cascade layer
 * reordered by minification, or a rewritten `@media` block would all ship
 * green. The responsive `DataTable` collapse (`.dt-stack`,
 * `src/styles/index.css`) is the shape most exposed to that: it lives in a
 * stylesheet rather than in utility classes on elements, and ten routes'
 * mobile layout depends on it.
 *
 * These assert **rendered geometry**, never the text of the emitted CSS.
 * Grepping `dist/assets/*.css` for `.dt-stack` or `@layer` was the rejected
 * alternative — it catches exactly one regression and breaks whenever the
 * minifier changes its mind.
 *
 * The signed-in Wallet Journal (`/wallet/journal`) is the target: a six-column
 * `DataTable` ("Journal") that stacks into cards below `sm`, fed by seeded
 * sign-in and a mocked journal answer, so nothing real is hit. Its rows are
 * `display: table-row` as a table and a block/flex card once `.dt-stacked`'s
 * stylesheet rule applies, which is what the phone assertion reads.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * Layout coordinates are fractional, and a device pixel ratio of 1 still
 * leaves sub-pixel drift between two cells that genuinely share a baseline.
 * The two states this distinguishes are one text line apart (~16px), so a
 * 2px tolerance separates them with room to spare in both directions.
 */
const BASELINE_TOLERANCE_PX = 2;

const TABLE_NAME = 'Journal';

const JOURNAL = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  date: `2026-09-0${index + 1}T00:00:00Z`,
  ref_type: index % 2 === 0 ? 'bounty_prizes' : 'player_donation',
  description: `E2E journal entry ${index + 1}`,
  amount: 1_000_000 * (index + 1),
  balance: 50_000_000 + index,
}));

/** Answer the journal before sign-in: boot prefetch would cache the shared mock's empty list. */
async function signInToJournal(page: import('@playwright/test').Page) {
  await page.route(
    (url) => url.pathname === `/characters/${CHARACTER_ID}/wallet/journal`,
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JOURNAL) })
  );
  await signInAndGoto(page, './wallet/journal');
}

/** The first journal row, once it has rendered. */
async function firstRow(page: import('@playwright/test').Page) {
  const row = page
    .getByRole('table', { name: TABLE_NAME })
    .locator('tbody tr[data-row-key]')
    .first();
  await expect(row).toBeVisible();
  return row;
}

/** The first row's Date cell and the Type cell beside it in source order. */
async function firstRowCellTops(page: import('@playwright/test').Page) {
  const row = await firstRow(page);
  const item = row.locator('td').nth(0);
  const quantity = row.locator('td').nth(1);
  await expect(item).toBeVisible();
  await expect(quantity).toBeVisible();
  const itemBox = await item.boundingBox();
  const quantityBox = await quantity.boundingBox();
  if (!itemBox || !quantityBox) throw new Error('DataTable cells have no layout box');
  return { item: itemBox.y, quantity: quantityBox.y };
}

test.describe('production bundle — phone width', () => {
  test.use({ viewport: PHONE });

  test('the page does not scroll sideways and the table has collapsed', async ({ page }) => {
    await signInToJournal(page);
    await expect(page.getByRole('table', { name: TABLE_NAME })).toBeVisible();

    // `scrollWidth` is never below `clientWidth`, so "not wider" is the whole
    // assertion — spelled as an inequality rather than equality because a
    // fractional layout can report the two a hair apart while nothing
    // actually overflows.
    //
    // The offender list is not decoration: this assertion is page-wide, and
    // CI is the first place it ever runs against real production CSS. Without
    // it a failure says only "something is too wide", leaving "`.dt-stack`
    // regressed" and "an unrelated journal element got wider" impossible to
    // tell apart from the log.
    const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
      const root = document.documentElement;
      const limit = root.clientWidth;
      const offenders = Array.from(document.body.querySelectorAll('*'))
        .map((element) => ({ element, right: element.getBoundingClientRect().right }))
        // 1px of slack: a fractional right edge on an element that fits
        // exactly is not an overflow.
        .filter((entry) => entry.right > limit + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 5)
        .map(({ element, right }) => {
          const name = element.getAttribute('aria-label') ?? element.id;
          return `${element.tagName.toLowerCase()}${name ? `[${name}]` : ''} @ ${Math.round(right)}px`;
        });
      return { scrollWidth: root.scrollWidth, clientWidth: limit, offenders };
    });
    expect(
      scrollWidth,
      `Page is ${scrollWidth}px wide in a ${clientWidth}px viewport. Widest elements: ${
        offenders.join(', ') || '(none individually past the edge)'
      }`
    ).toBeLessThanOrEqual(clientWidth);

    // Collapsed: the row is a card, not a table row. This reads the computed
    // `display`, which only the stylesheet's `.dt-stacked` rules can change.
    const row = await firstRow(page);
    expect(await row.evaluate((tr) => getComputedStyle(tr).display)).not.toBe('table-row');
  });
});

test.describe('production bundle — desktop width', () => {
  test.use({ viewport: DESKTOP });

  test('the same two cells share a baseline as a real table row', async ({ page }) => {
    await signInToJournal(page);
    await expect(page.getByRole('table', { name: TABLE_NAME })).toBeVisible();

    const row = await firstRow(page);
    expect(await row.evaluate((tr) => getComputedStyle(tr).display)).toBe('table-row');
    const tops = await firstRowCellTops(page);
    expect(Math.abs(tops.quantity - tops.item)).toBeLessThanOrEqual(BASELINE_TOLERANCE_PX);
  });
});
