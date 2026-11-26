import type { Locator, Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';

const ITEM = '1MN Afterburner I';

async function stubEveryType(page: Page) {
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

async function openCompareDrawer(page: Page) {
  await signInAndGoto(page);
  await stubEveryType(page);
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill(ITEM);
  const leaf = page.getByRole('button', { name: ITEM, exact: true });
  await expect(leaf).toBeVisible();
  await leaf.click();

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

  const box = (await drawer.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(
    await page.evaluate(() => document.documentElement.getBoundingClientRect().width)
  );
  expect(Math.abs(box.height - PHONE.height)).toBeLessThanOrEqual(1);

  const fitting = drawer.getByRole('table', { name: 'Fitting' });
  expect(await fitting.evaluate((table) => getComputedStyle(table).display)).toBe('table');

  const attribute = fitting.getByRole('cell').first();
  expect(await scrollerCount(drawer)).toBe(1);
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
  const after = (await attribute.boundingBox())!.x;
  expect(after).toBeGreaterThanOrEqual(0);
  expect(after).toBeLessThanOrEqual(before);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});

test('Variations compare keeps real item columns above sm (1280px)', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const drawer = await openCompareDrawer(page);

  const header = drawer.getByRole('columnheader', { name: '1MN Afterburner II', exact: true });
  await expect(header.first()).toBeVisible();
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

  expect(await attribute.evaluate((cell) => getComputedStyle(cell).position)).toBe('sticky');

  expect(await scrollerCount(drawer)).toBe(1);
});

test('Compare drawer Prices view is a plain table at 390px, the item pinned and the page still', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const drawer = await openCompareDrawer(page);
  await drawer.getByRole('button', { name: 'Prices', exact: true }).click();

  const table = drawer.getByRole('table', { name: 'Compare' });
  const row = table.locator('tbody tr[data-row-key]').first();
  await expect(row).toBeVisible();
  expect(await row.evaluate((tr) => getComputedStyle(tr).display)).toBe('table-row');
  expect(
    await row.locator('td[data-label="Item"]').evaluate((td) => getComputedStyle(td).position)
  ).toBe('sticky');
  await expectNoPageOverflow(page);
});
