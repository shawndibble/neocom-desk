import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';

const JITA_STATION = 60003760;
const TYPE_IDS = [
  11269, 16272, 16273, 16274, 16275, 17887, 17888, 17889, 34, 35, 36, 37, 38, 39, 40,
];

const LIST = {
  id: 'e2e-list',
  name: 'Jita',
  locationId: JITA_STATION,
  items: TYPE_IDS.map((typeId, i) => ({ typeId, target: 5_000 - i })),
};

const TABLE = 'table[aria-label="Stock targets"]';

async function openStock(page: import('@playwright/test').Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await signInAndGoto(page, './market/stock', undefined, [
    { key: 'sync.stockLists', value: [LIST] },
  ]);
  await expect(page.locator(TABLE)).toBeVisible();
}

const bar = (page: import('@playwright/test').Page) =>
  page.locator(`${TABLE} tbody tr`).first().locator('.min-w-16');
const legend = (page: import('@playwright/test').Page) =>
  page.getByText('Listed (coloured by status)');

test('the Stock Manager fits its panel at 1024px without the fill bar', async ({ page }) => {
  await openStock(page, 1024, 900);
  await expectNoPageOverflow(page);
  const table = await page.locator(TABLE).boundingBox();
  expect(table!.x + table!.width).toBeLessThanOrEqual(1024);
  await expect(bar(page)).toBeHidden();
  await expect(legend(page)).toBeHidden();
  const item = await page
    .locator(`${TABLE} tbody tr`)
    .first()
    .getByRole('cell')
    .nth(1)
    .boundingBox();
  expect(item!.height).toBeLessThanOrEqual(110);
});

for (const width of [1280, 1440]) {
  test(`the fill bar and legend stay at ${width}px`, async ({ page }) => {
    await openStock(page, width, 900);
    await expectNoPageOverflow(page);
    await expect(bar(page)).toBeVisible();
    await expect(legend(page)).toBeVisible();
  });
}

test('phone cards keep the fill bar', async ({ page }) => {
  await openStock(page, 390, 800);
  await expectNoPageOverflow(page);
  await expect(bar(page)).toBeVisible();
});
