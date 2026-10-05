/**
 * Variations "Compare" attribute matrix stacking (issue #1128), now the
 * Compare drawer's Attributes view rather than its own modal (issue #1425 —
 * the drawer gets a Prices/Attributes switch, and Variations "Compare" adds
 * its rows to the Compare Set and opens the drawer there instead of covering
 * the order book). The matrix itself was a hand-rolled `<table>` that never
 * went through `DataTable`, so it had no responsive behaviour at all — at
 * 390px it showed about two of up to `VARIATIONS_LIMIT` (20) 96px item
 * columns and made the reader scroll sideways once per attribute row. It now
 * renders one `DataTable` per attribute category. Below `sm` that first
 * meant the stacked card (#1128), which truncated every item name into one
 * label gutter; it is now a real matrix at every width, narrower columns on
 * a phone and a sideways scroll under a pinned attribute column past ~5
 * items, inside a full-screen sheet.
 *
 * jsdom has no layout, so `CompareAttributesMatrix.test.tsx` can only assert
 * the markup — not that the sheet fills the screen or the attribute column
 * really stays put while the items scroll. That needs a real browser at a
 * real viewport, the same reasoning `marketCompareNarrow.spec.ts` gives.
 *
 * `1MN Afterburner I` is the fixture item because its variation group is 18
 * members deep in the bundled SDE — well past the 2-3 item happy path the
 * `SkillCompare` precedent ever exercised, which is the ticket's hostile-review
 * objection.
 */
import type { Locator, Page } from '@playwright/test';
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

/**
 * How many distinct sideways scroll containers hold the drawer's tables —
 * one means every category scrolls together, so scrolling Fitting to column
 * 12 can't leave Capacitor on column 1.
 */
async function scrollerCount(drawer: Locator) {
  return drawer.getByRole('table').evaluateAll((tables) => {
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
}

/** Market Browser → search the fixture item → Variations tab → "Compare". */
async function openCompareDrawer(page: Page) {
  await signInAndGoto(page);
  await stubEveryType(page);
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill(ITEM);
  const leaf = page.getByRole('button', { name: ITEM, exact: true });
  await expect(leaf).toBeVisible();
  await leaf.click();

  // Variations is the selected item's own tab, beside Order Book and Price History.
  await page.getByRole('tab', { name: /^Variations/ }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Compare' });
  await expect(drawer.getByText('Fitting')).toBeVisible();
  return drawer;
}

test('Variations compare is a full-screen matrix at 390px, scrolling sideways under a pinned attribute column', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const drawer = await openCompareDrawer(page);

  // Below `md` the drawer is a full-screen sheet over the bottom nav, not an
  // 80vh strip above it.
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  // Against the page's own width, which a desktop browser's classic
  // scrollbar narrows below the 390px window (a phone's overlay one doesn't).
  expect(box.width).toBe(
    await page.evaluate(() => document.documentElement.getBoundingClientRect().width)
  );
  expect(Math.abs(box.height - PHONE.height)).toBeLessThanOrEqual(1);

  // A real matrix, never the stacked card: comparing means reading across.
  const fitting = drawer.getByRole('table', { name: 'Fitting' });
  expect(await fitting.evaluate((table) => getComputedStyle(table).display)).toBe('table');

  // Eighteen-odd variants can't fit 390px, so the matrix scrolls sideways —
  // in one scroller, with the attribute names pinned at its left edge.
  const attribute = fitting.getByRole('cell').first();
  expect(await scrollerCount(drawer)).toBe(1);
  // Columns keep their set widths rather than being squeezed to the screen
  // (DataTable's own `w-full` once won, crushing every column to a letter):
  // the attribute column lines up with the one header row's corner cell.
  const corner = drawer
    .getByRole('table', { name: 'Compared items' })
    .getByRole('columnheader')
    .first();
  const fittingFirstColumn = fitting.locator('tbody tr').first().locator('td').first();
  expect(
    Math.abs((await corner.boundingBox())!.width - (await fittingFirstColumn.boundingBox())!.width)
  ).toBeLessThanOrEqual(1);
  const before = (await attribute.boundingBox())!.x;
  const scrolled = await fitting.evaluate((table) => {
    let node = table.parentElement;
    while (node && !['auto', 'scroll'].includes(getComputedStyle(node).overflowX)) {
      node = node.parentElement;
    }
    node!.scrollLeft = 300;
    return node!.scrollLeft;
  });
  expect(scrolled).toBeGreaterThan(0);
  // Pinned: it slides at most the scroller's own padding (to its edge),
  // where unpinned it would have gone 300px off-screen.
  const after = (await attribute.boundingBox())!.x;
  expect(after).toBeGreaterThanOrEqual(0);
  expect(after).toBeLessThanOrEqual(before);

  // The page itself never scrolls sideways.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});

test('Variations compare keeps real item columns above sm (1280px)', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const drawer = await openCompareDrawer(page);

  // Items are columns again, named once in the sticky header row above every
  // category (each category table keeps its own header, visually hidden).
  // The compared set includes the searched item itself (owner decision #2)
  // alongside its variants — `ITEM` would only match one column as a
  // substring, so this asserts on a variant's exact name instead.
  const header = drawer.getByRole('columnheader', { name: '1MN Afterburner II', exact: true });
  await expect(header.first()).toBeVisible();
  // The corner cell of the one visible header row — it shows the words
  // every item's name shares, so it is found by position, not by name.
  const attribute = drawer
    .getByRole('table', { name: 'Compared items' })
    .getByRole('columnheader')
    .first();
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
  expect(await scrollerCount(drawer)).toBe(1);
});
