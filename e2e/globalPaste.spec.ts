/**
 * The app-wide paste router (`src/app/GlobalPasteRouter.tsx`): a page-level
 * paste — nothing focused — of an EFT fit offers to open it in Fittings, and
 * of an item list offers to appraise it. Covers the hand-off the unit tests
 * stop short of: the route state actually opening the fit in the editor, and
 * actually pricing the list.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

/** Same as `fittingsLoadNarrow.spec.ts`: skill gaps ask ESI for every fitted type. */
async function answerAnyType(page: Page) {
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
        dogma_attributes: [],
      }),
    });
  });
}

/** Every asked-for type at a flat price — this spec checks the hand-off, not the figures. */
async function mockHubPrices(page: Page): Promise<void> {
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const quote = { volume: '900000000', orderCount: '40' };
    const body = Object.fromEntries(
      types
        .split(',')
        .map((raw) => [raw, { buy: { max: '5', ...quote }, sell: { min: '6', ...quote } }])
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** A real Ctrl+V can't reach the clipboard in headless Chromium; this is the event it raises. */
async function pasteOnPage(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    (document.activeElement as HTMLElement | null)?.blur();
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', value);
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
    );
  }, text);
}

/**
 * Signs in on the Fittings tab and waits for the signed-in shell — the router
 * mounts with it, so a paste any earlier has nobody listening.
 */
async function openFittings(page: Page): Promise<void> {
  await signInAndGoto(page, './ships/fittings');
  await expect(page.getByRole('heading', { name: 'Ships', level: 1 })).toBeVisible({
    timeout: 15_000,
  });
}

const RIFTER_EFT = [
  '[Rifter, Pasted Fit]',
  '125mm Gatling AutoCannon I',
  '',
  '1MN Afterburner I',
].join('\n');

test.describe('Global paste', () => {
  test('a pasted EFT fit offers Fittings, and opens in the editor', async ({ page }) => {
    await openFittings(page);
    await answerAnyType(page);

    await pasteOnPage(page, RIFTER_EFT);
    // Generous: the first paste downloads the market type index.
    await page.getByRole('button', { name: 'Open in Fittings' }).click({ timeout: 15_000 });

    await expect(page).toHaveURL(/\/ships\/fittings\/edit\?f=/);
    await expect(page.getByRole('heading', { name: 'Pasted Fit', level: 1 })).toBeVisible();
    // The autocannon landed in the first high slot.
    await expect(page.getByRole('button', { name: 'High slots 1, active' })).toBeVisible();
  });

  test('a pasted item list offers the Appraisal, and prices it', async ({ page }) => {
    await openFittings(page);
    await mockHubPrices(page);

    await pasteOnPage(page, 'Tritanium\t3,400,000\nPyerite\t1,750,000');
    await page.getByRole('button', { name: 'Appraise' }).click({ timeout: 15_000 });

    await expect(page).toHaveURL(/\/market\/appraisal/);
    await expect(page.getByRole('table', { name: 'Appraisal' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('table', { name: 'Appraisal' })).toContainText('Pyerite');
  });

  test('a paste into a field is left alone', async ({ page }) => {
    await openFittings(page);
    const field = page.getByRole('searchbox').or(page.getByRole('textbox')).first();
    await field.focus();
    await page.evaluate((value) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', value);
      document.activeElement!.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      );
    }, RIFTER_EFT);
    await page.waitForTimeout(1_500);
    await expect(page.getByRole('button', { name: 'Open in Fittings' })).toHaveCount(0);
  });
});
