/**
 * Variations "Compare" attribute matrix stacking (issue #1128), now the
 * Compare drawer's Attributes view rather than its own modal (issue #1425 —
 * the drawer gets a Prices/Attributes switch, and Variations "Compare" adds
 * its rows to the Compare Set and opens the drawer there instead of covering
 * the order book). The matrix itself was a hand-rolled `<table>` that never
 * went through `DataTable`, so it had no responsive behaviour at all — at
 * 390px it showed about two of up to `VARIATIONS_LIMIT` (20) 96px item
 * columns and made the reader scroll sideways once per attribute row. It now
 * renders one `DataTable` per attribute category, inheriting the default
 * below-`sm` stack (DESIGN.md §4a, the same move #406 made for
 * `SkillCompare`).
 *
 * jsdom has no layout and no media queries, so
 * `CompareAttributesMatrix.test.tsx` can only assert the markup carries
 * `.dt-stack` and its `data-label`s — not that the cards actually lay out
 * without a sideways scroll. That needs a real browser at a real viewport,
 * the same reasoning `marketCompareNarrow.spec.ts` gives.
 *
 * `1MN Afterburner I` is the fixture item because its variation group is 18
 * members deep in the bundled SDE — well past the 2-3 item happy path the
 * `SkillCompare` precedent ever exercised, which is the ticket's hostile-review
 * objection.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Roots the variation group, and is itself included in the compared set (owner decision #2). */
const ITEM = '1MN Afterburner I';

/**
 * Every compared variation is fetched from `/universe/types/{id}`, and the
 * shared ESI mock only carries a handful of fixture types — so answer for any
 * type id, with three attributes spread across two categories (Fitting,
 * Capacitor) so the modal renders more than one `DataTable`.
 */
async function stubEveryType(page: Page) {
  // Each variation row prices itself from the region's order book, one call
  // per row — the shared mock carries none of these type ids. Empty books are
  // fine here: the Worth row's own formatting isn't what this spec measures.
  await page.route(/\/markets\/\d+\/orders/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route(/\/universe\/types\/\d+$/, async (route) => {
    const typeId = Number(/\/universe\/types\/(\d+)$/.exec(route.request().url())![1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type_id: typeId,
        name: `Type ${typeId}`,
        description: '',
        group_id: 46,
        published: true,
        dogma_attributes: [
          { attribute_id: 30, value: typeId % 100 },
          { attribute_id: 50, value: 20 },
          { attribute_id: 6, value: 5 },
        ],
      }),
    });
  });
}

/** Market Browser → search the fixture item → Variations panel → "Compare". */
async function openCompareDrawer(page: Page) {
  await signInAndGoto(page);
  await stubEveryType(page);
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill(ITEM);
  const leaf = page.getByRole('button', { name: ITEM, exact: true });
  await expect(leaf).toBeVisible();
  await leaf.click();

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Compare' });
  await expect(drawer.getByText('Fitting')).toBeVisible();
  return drawer;
}

test('Variations compare stacks into labelled cards at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const drawer = await openCompareDrawer(page);

  // Non-modal (round 8): the order book beside it stays interactive rather
  // than being inerted, which is exactly what the old modal did wrong. The
  // heading, not a table: `stubEveryType` serves empty books, so the section
  // renders its empty state. Inert content drops out of the accessibility
  // tree, so a role query still fails if the drawer blocks the book.
  await expect(page.getByRole('heading', { name: 'Sell Orders' })).toBeVisible();

  // A phone can't hold a stacked matrix at the 280px default drawer height,
  // so opening on Attributes goes straight to `full` (80vh).
  expect(await drawer.evaluate((el) => el.style.height)).toBe('80vh');

  // Both stubbed categories plus the synthetic "Worth" group, so what follows
  // measures the real multi-table shape and not one table passing for all.
  // That each carries `.dt-stack` is `CompareAttributesMatrix.test.tsx`'s job;
  // this spec exists for what the class does once a browser lays it out.
  const tables = drawer.getByRole('table');
  expect(await tables.count()).toBeGreaterThanOrEqual(3);
  await expect(drawer.getByRole('table', { name: 'Capacitor' })).toBeAttached();

  // An attribute table, named rather than positional: `buildCompareMatrix`
  // returns "Worth" first, so `.first()` would measure the one-row price
  // group and never touch an attribute card.
  const fitting = drawer.getByRole('table', { name: 'Fitting' });

  // The stack is what's rendering, not columns. `.dt-stack` makes the table
  // itself a block and clips the header row off-screen, so read the computed
  // layout rather than visibility — a clipped 1px `thead` still counts as
  // "visible" to a bounding-box check.
  expect(await fitting.evaluate((table) => getComputedStyle(table).display)).toBe('block');
  expect(
    await fitting.evaluate((table) => {
      const head = table.querySelector('thead')!;
      return head.getBoundingClientRect().width;
    })
  ).toBeLessThanOrEqual(1);

  // Every compared item is a labelled line in the card. A floor rather than
  // the exact 18 variants plus the selected item, so an SDE update that adds
  // a variation doesn't fail this.
  const labels = await fitting
    .locator('td[data-label]')
    .evaluateAll((cells) => [...new Set(cells.map((cell) => cell.getAttribute('data-label')))]);
  expect(labels.length).toBeGreaterThanOrEqual(10);

  // Nothing forces a sideways scroll — the failure the ticket describes.
  // Measured on the tables themselves: `overflow-x-auto` on the matrix's own
  // wrapper clips an overflowing table rather than widening `documentElement`.
  for (const table of await tables.all()) {
    const overflow = await table.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('Variations compare keeps real item columns above sm (1280px)', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const drawer = await openCompareDrawer(page);

  // Items are columns again, with a visible header row per category table.
  // The compared set includes the searched item itself (owner decision #2)
  // alongside its variants — `ITEM` would only match one column as a
  // substring, so this asserts on a variant's exact name instead.
  const header = drawer.getByRole('columnheader', { name: '1MN Afterburner II', exact: true });
  await expect(header.first()).toBeVisible();
  const attribute = drawer.getByRole('columnheader', { name: 'Attribute', exact: true }).first();
  await expect(attribute).toBeVisible();

  expect(
    await drawer
      .getByRole('table')
      .first()
      .evaluate((table) => getComputedStyle(table).display)
  ).toBe('table');

  // The attribute stays pinned while the items scroll past it.
  expect(await attribute.evaluate((cell) => getComputedStyle(cell).position)).toBe('sticky');

  // Every category scrolls together: one scroll container for the whole
  // matrix, not one per table, or scrolling Fitting to column 12 would leave
  // Capacitor on column 1.
  const scrollers = await drawer.getByRole('table').evaluateAll((tables) => {
    const found = new Set<Element>();
    for (const table of tables) {
      let node = table.parentElement;
      while (node && !['auto', 'scroll'].includes(getComputedStyle(node).overflowX)) {
        node = node.parentElement;
      }
      if (node) found.add(node);
    }
    return found.size;
  });
  expect(scrollers).toBe(1);
});
