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
 * `/styleguide` is the target because it sits outside `RequireCharacter`,
 * needs no ESI data, and already carries a six-column table built for this
 * exact question ("Six columns of real-world width: the shape that forced
 * the responsive collapse").
 */
import { test, expect } from './support/testBase';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * Layout coordinates are fractional, and a device pixel ratio of 1 still
 * leaves sub-pixel drift between two cells that genuinely share a baseline.
 * The two states this distinguishes are one text line apart (~16px), so a
 * 2px tolerance separates them with room to spare in both directions.
 */
const BASELINE_TOLERANCE_PX = 2;

const TABLE_NAME = 'Wide DataTable sample';

/** The first row's title cell and the cell beside it in source order. */
async function firstRowCellTops(page: import('@playwright/test').Page) {
  const row = page.getByRole('table', { name: TABLE_NAME }).locator('tbody tr').first();
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
    await page.goto('./styleguide');
    await expect(page.getByRole('table', { name: TABLE_NAME })).toBeVisible();

    // `scrollWidth` is never below `clientWidth`, so "not wider" is the whole
    // assertion — spelled as an inequality rather than equality because a
    // fractional layout can report the two a hair apart while nothing
    // actually overflows.
    //
    // The offender list is not decoration: this assertion is page-wide, and
    // CI is the first place it ever runs against real production CSS. Without
    // it a failure says only "something is too wide", leaving "`.dt-stack`
    // regressed" and "an unrelated styleguide sample got wider" impossible to
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

    // Collapsed: each cell is its own block in a column flexbox, so the
    // second cell sits a line below the first rather than beside it.
    const tops = await firstRowCellTops(page);
    expect(tops.quantity).toBeGreaterThan(tops.item + BASELINE_TOLERANCE_PX);
  });
});

test.describe('production bundle — desktop width', () => {
  test.use({ viewport: DESKTOP });

  test('the same two cells share a baseline', async ({ page }) => {
    await page.goto('./styleguide');
    await expect(page.getByRole('table', { name: TABLE_NAME })).toBeVisible();

    const tops = await firstRowCellTops(page);
    expect(Math.abs(tops.quantity - tops.item)).toBeLessThanOrEqual(BASELINE_TOLERANCE_PX);
  });
});
