/**
 * Fitting Price breakdown at 390px (#3682): name, Qty, Unit price and Total
 * hung off a compact `responsive="table"` in a ~366px modal body. On a phone
 * the unit price is shed (`phoneHidden`; Total / Qty gives it) and the item
 * name is pinned (`stickyStart`), so the table never scrolls sideways and the
 * full ISK total stays whole. From `sm` up all four columns stay.
 *
 * Playwright rather than jsdom: column hiding and overflow are CSS a real
 * engine has to evaluate. The Price section waits on the dogma engine's WASM
 * + SDE download, so it gets the cold-runner headroom the other fitting specs use.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { answerAnyType } from './support/universeTypes';
import { mockFlatHubPrices } from './support/piPrices';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };

const STATS_TIMEOUT = { timeout: 30_000 };

/** Two guns at 250M each: a 500M ISK line, the widest figure a real fit meets. */
const EFT = [
  '[Rifter, Appraisal Test]',
  '125mm Gatling AutoCannon I',
  '125mm Gatling AutoCannon I',
].join('\n');

async function openBreakdown(page: Page, size: { width: number; height: number }) {
  await signInAndGoto(page, './ships/fittings');
  await answerAnyType(page);
  await mockFlatHubPrices(page, { buy: 240_000_000, sell: 250_000_000 });
  await page.setViewportSize(size);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByLabel('Link or text').fill(EFT);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  // Below desktop the Ring, the List and the stats are one row of tabs.
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  await page.getByRole('button', { name: /^Price/ }).click();
  await page.getByRole('button', { name: 'Appraise' }).click(STATS_TIMEOUT);
  const dialog = page.getByRole('dialog', { name: 'Price breakdown' });
  await expect(dialog.getByText('500,000,000 ISK').first()).toBeVisible(STATS_TIMEOUT);
  return dialog;
}

test.describe('Fitting Price breakdown', () => {
  test('at 390 sheds the unit price and keeps the table inside the modal', async ({ page }) => {
    const dialog = await openBreakdown(page, PHONE);
    const table = dialog.getByRole('table', { name: 'Items and their prices' });

    await expect(table.getByRole('columnheader', { name: 'Unit price' })).toBeHidden();
    await expect(table.getByRole('columnheader', { name: 'Total' })).toBeVisible();

    const fits = await table.evaluate((el) => {
      const scroller = el.parentElement!;
      return scroller.scrollWidth <= scroller.clientWidth;
    });
    expect(fits).toBe(true);

    const total = (await table.getByText('500,000,000 ISK').first().boundingBox())!;
    expect(total.x + total.width).toBeLessThanOrEqual(PHONE.width);
  });

  test('at 768 keeps the unit price column', async ({ page }) => {
    const dialog = await openBreakdown(page, TABLET);
    await expect(
      dialog
        .getByRole('table', { name: 'Items and their prices' })
        .getByRole('columnheader', { name: 'Unit price' })
    ).toBeVisible();
  });
});
