import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockFlatHubPrices } from './support/piPrices';
import {
  CONTROL_ROW_WIDTHS,
  expectInlineControlsAligned,
  findControlHeightMismatches,
} from './support/controlHeights';

const SAMPLE = [
  '/assets',
  '/contracts',
  '/market/orders',
  '/market/hauling',
  '/wallet/journal',
  '/industry',
  '/skills/certificates',
  '/corp/assets',
];

const LOADING = 'main .animate-spin, main [role="progressbar"]:not([aria-valuenow])';

async function expectSettledAndAligned(page: Page, label: string): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        if ((await page.locator(LOADING).count()) > 0) return ['still loading'];
        return findControlHeightMismatches(page, 'body');
      },
      {
        message: `${label}: inline controls of different heights (DESIGN.md §3 — one size per row)`,
        timeout: 15_000,
      }
    )
    .toEqual([]);
}

async function signInAndGotoPriced(page: Page, url: string): Promise<void> {
  if (url.startsWith('/market/hauling')) await mockFlatHubPrices(page, { buy: 5, sell: 5 });
  await signInAndGoto(page, url);
}

for (const url of SAMPLE) {
  test(`${url}: inline controls share one height`, async ({ page }) => {
    await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
    await signInAndGotoPriced(page, url);
    for (const width of CONTROL_ROW_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectSettledAndAligned(page, `${url} @${width}`);
    }
  });

  test(`${url}: the open filters share one height`, async ({ page }) => {
    await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
    await signInAndGotoPriced(page, url);
    await expectSettledAndAligned(page, url);
    const funnels = page.getByRole('button', { name: /^Filters/ });
    const count = await funnels.count();
    for (let i = 0; i < count; i += 1) {
      const funnel = funnels.nth(i);
      if (!(await funnel.isVisible())) continue;
      await funnel.click();
      await expectSettledAndAligned(page, `${url} filters open (${i})`);
      await page.keyboard.press('Escape');
    }
  });
}

test('/market/hauling: the open filter row shares one height', async ({ page }) => {
  await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
  await signInAndGoto(page, '/market/hauling');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('textbox', { name: 'Max spend' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Max price per item' }).fill('1000000');
  await expect(page.getByRole('textbox', { name: 'Max price per item' })).toHaveValue('1,000,000');
  await expectInlineControlsAligned(page, '/market/hauling filters open');
  const field = await page.getByRole('textbox', { name: 'Max price per item' }).boundingBox();
  const sells = await page.getByRole('combobox', { name: 'Sells within' }).boundingBox();
  expect(Math.abs(field!.y - sells!.y)).toBeLessThanOrEqual(1);
});

for (const width of [960, 1024]) {
  test(`/market/hauling @${width}: the filter funnel stays on the route row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAndGoto(page, '/market/hauling');
    const from = await page.getByRole('combobox', { name: 'From' }).boundingBox();
    const funnel = await page.getByRole('button', { name: /^Filters/ }).boundingBox();
    expect(Math.abs(funnel!.y + funnel!.height / 2 - (from!.y + from!.height / 2))).toBeLessThan(4);
  });
}
