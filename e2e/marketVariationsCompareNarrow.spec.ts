/**
 * Variations "Compare" modal stacking (issue #1128): the modal's
 * attribute matrix was a hand-rolled `<table>` that never went through
 * `DataTable`, so it had no responsive behaviour at all — at 390px it showed
 * about two of up to `VARIATIONS_LIMIT` (20) 96px item columns and made the
 * reader scroll sideways once per attribute row. It now renders one
 * `DataTable` per attribute category, inheriting the default below-`sm`
 * stack (DESIGN.md §4a, the same move #406 made for `SkillCompare`).
 *
 * jsdom has no layout and no media queries, so `VariationsCompareModal.test.tsx`
 * can only assert the markup carries `.dt-stack` and its `data-label`s — not
 * that the cards actually lay out without a sideways scroll. That needs a real
 * browser at a real viewport, the same reasoning `marketCompareNarrow.spec.ts`
 * gives.
 *
 * `1MN Afterburner I` is the fixture item because its variation group is 18
 * members deep in the bundled SDE — well past the 2-3 item happy path the
 * `SkillCompare` precedent ever exercised, which is the ticket's hostile-review
 * objection.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** The fixture item's own name, and the variation group it roots. */
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
async function openCompareModal(page: Page) {
  await loginAndSelectCharacter(page);
  await stubEveryType(page);
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill(ITEM);
  const leaf = page.getByRole('button', { name: ITEM, exact: true });
  await expect(leaf).toBeVisible();
  await leaf.click();

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Fitting')).toBeVisible();
  return dialog;
}

test('Variations compare stacks into labelled cards at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const dialog = await openCompareModal(page);

  // Every category table stacks — none opts out with `responsive="table"`.
  // Both stubbed categories plus the synthetic "Worth" group are present, so
  // this is the real multi-table shape and not one table passing for all.
  const tables = dialog.getByRole('table');
  expect(await tables.count()).toBeGreaterThanOrEqual(3);
  for (const table of await tables.all()) {
    await expect(table).toHaveClass(/dt-stack/);
  }
  await expect(dialog.getByRole('table', { name: 'Capacitor' })).toBeAttached();

  // An attribute table, named rather than positional: `buildCompareMatrix`
  // returns "Worth" first, so `.first()` would measure the one-row price
  // group and never touch an attribute card.
  const fitting = dialog.getByRole('table', { name: 'Fitting' });

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

  // More than the 2-3 items the precedent exercised: this variation group
  // contributes 18 compared items, each a labelled line in the card.
  const labels = await fitting
    .locator('td[data-label]')
    .evaluateAll((cells) => [...new Set(cells.map((cell) => cell.getAttribute('data-label')))]);
  expect(labels.length).toBeGreaterThanOrEqual(10);

  // Nothing forces a sideways scroll — the failure the ticket describes.
  // Measured on the tables themselves: the modal is a `fixed inset-0
  // overflow-hidden` dialog, so an overflowing matrix inside it is clipped
  // and never widens `documentElement`.
  for (const table of await tables.all()) {
    const overflow = await table.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('Variations compare keeps real item columns at and above md (1280px)', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const dialog = await openCompareModal(page);

  // Items are columns again, with a visible header row per category table.
  // The compared set excludes the searched item itself, so a variation of it
  // names the column — `ITEM` would only match one as a substring.
  const header = dialog.getByRole('columnheader', { name: '1MN Afterburner II', exact: true });
  await expect(header.first()).toBeVisible();
  const attribute = dialog.getByRole('columnheader', { name: 'Attribute', exact: true }).first();
  await expect(attribute).toBeVisible();

  // Real columns: the table lays out as a table, not as the stack's blocks.
  expect(
    await dialog
      .getByRole('table')
      .first()
      .evaluate((table) => getComputedStyle(table).display)
  ).toBe('table');

  // The attribute stays pinned while the items scroll, as it did when it was
  // a `sticky left-0` row header.
  expect(await attribute.evaluate((cell) => getComputedStyle(cell).position)).toBe('sticky');

  // Every category scrolls together: one scroll container for the whole
  // matrix, not one per table, or scrolling Fitting to column 12 would leave
  // Capacitor on column 1.
  const scrollers = await dialog.getByRole('table').evaluateAll((tables) => {
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
