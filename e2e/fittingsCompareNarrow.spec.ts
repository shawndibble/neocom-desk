import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { answerAnyType } from './support/universeTypes';

const FIT_A = ['[Rifter, Fit A]', '125mm Gatling AutoCannon I'].join('\n');
const FIT_B = ['[Merlin, Fit B]', '125mm Gatling AutoCannon I', '125mm Gatling AutoCannon I'].join(
  '\n'
);
const FIT_C = ['[Punisher, Fit C]', '125mm Gatling AutoCannon I'].join('\n');
const STATS_TIMEOUT = { timeout: 20_000 };

async function addFitting(page: Page, eft: string) {
  await page.getByRole('button', { name: 'Compare with' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Compare with' });
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await dialog.getByLabel('Link or text').fill(eft);
  await dialog.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function pageOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

test.describe('Fitting Compare at 390px', () => {
  test('cards scroll sideways and every row stacks the fits, inside 390px', async ({ page }) => {
    await signInAndGoto(page, './ships/fittings/compare');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);

    for (const eft of [FIT_A, FIT_B, FIT_C]) await addFitting(page, eft);
    await expect(page.getByTestId('compare-card')).toHaveCount(3);
    await expect(page.getByRole('table', { name: 'Head to head' })).toBeVisible(STATS_TIMEOUT);
    await expect(page.getByText('Show differences only')).toBeVisible();

    const strip = page.getByTestId('compare-cards');
    const scroll = await strip.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(scroll).toBeGreaterThan(0);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('a long Fitting name stays inside its card', async ({ page }) => {
    await signInAndGoto(page, './ships/fittings/compare');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);
    await addFitting(page, FIT_A);
    await addFitting(
      page,
      ['[Merlin, Fit B With A Rather Long Name Indeed]', '125mm Gatling AutoCannon I'].join('\n')
    );
    const card = page.getByTestId('compare-card').nth(1);
    const link = card.getByRole('link', { name: /Rather Long Name/ });
    await expect(link).toBeVisible();
    const cardBox = (await card.boundingBox())!;
    const linkBox = (await link.boundingBox())!;
    expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('Fitting Compare scenario line', () => {
  async function gotoWithOneFit(page: Page) {
    await signInAndGoto(page, './ships/fittings/compare');
    await answerAnyType(page);
    await expect(page.getByTestId('compare-controls')).toHaveCount(0);
    await addFitting(page, FIT_A);
    await expect(page.getByTestId('compare-controls')).toBeVisible();
  }

  test('at 390 the target summary reads as text, not a raw i18n key', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoWithOneFit(page);
    await expect(page.getByText(/\d+ m sig · \d+ m\/s/).first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\bfittings\.\w+\./);
  });

  test('at 1440 the sentence is one row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoWithOneFit(page);
    const ys: number[] = [];
    for (const name of ['Target profile', 'Damage profile', 'Abyssal weather']) {
      ys.push((await page.getByRole('combobox', { name }).boundingBox())!.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });

  test('Manage targets is the last choice in the target select', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoWithOneFit(page);
    await page.getByRole('combobox', { name: 'Target profile' }).click();
    await page.getByRole('option', { name: 'Manage targets' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Fitting Compare columns', () => {
  for (const size of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`cards line up over their head-to-head columns at ${size.width}`, async ({ page }) => {
      await page.setViewportSize(size);
      await signInAndGoto(page, './ships/fittings/compare');
      await answerAnyType(page);
      for (const eft of [FIT_A, FIT_B, FIT_C]) await addFitting(page, eft);
      const table = page.getByRole('table', { name: 'Head to head' });
      await expect(table).toBeVisible(STATS_TIMEOUT);
      const cells = table.getByRole('row').first().getByRole('cell');
      await expect(cells).toHaveCount(3);
      const cards = page.getByTestId('compare-card');
      for (const i of [0, 1, 2]) {
        const card = (await cards.nth(i).boundingBox())!;
        const cell = (await cells.nth(i).boundingBox())!;
        expect(Math.abs(card.x - cell.x)).toBeLessThanOrEqual(1);
      }
    });
  }
});
