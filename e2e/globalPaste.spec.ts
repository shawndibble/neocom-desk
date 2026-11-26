import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { answerAnyType } from './support/universeTypes';
import { mockFlatHubPrices } from './support/piPrices';

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
  test('a pasted EFT fit opens in the editor', async ({ page }) => {
    await openFittings(page);
    await answerAnyType(page);

    await pasteOnPage(page, RIFTER_EFT);
    await expect(page).toHaveURL(/\/ships\/fittings\/edit\?f=/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Pasted Fit', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^High slots 1: 125mm Gatling AutoCannon I, active\b/ })
    ).toBeVisible();
  });

  test('a pasted item list opens the Appraisal, and prices it', async ({ page }) => {
    await openFittings(page);
    await mockFlatHubPrices(page, { buy: 5, sell: 6 });

    await pasteOnPage(page, 'Tritanium\t3,400,000\nPyerite\t1,750,000');
    await expect(page).toHaveURL(/\/market\/appraisal/, { timeout: 15_000 });
    await expect(page.getByRole('table', { name: 'Appraisal' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('table', { name: 'Appraisal' })).toContainText('Pyerite');
  });
});
