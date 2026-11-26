import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { answerAnyType } from './support/universeTypes';

const FIT_A = ['[Rifter, Fit A]', '125mm Gatling AutoCannon I'].join('\n');
const FIT_B = ['[Merlin, Fit B]', '125mm Gatling AutoCannon I'].join('\n');
const FIT_C = ['[Punisher, Fit C]', '125mm Gatling AutoCannon I'].join('\n');

async function addFitting(page: Page, eft: string) {
  await page.getByRole('button', { name: 'Compare with' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Compare with' });
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await dialog.getByLabel('Link or text').fill(eft);
  await dialog.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test.describe('Fitting Compare at 390px', () => {
  test('adds Fittings, pages through three on phone, and keeps the layout within 390px', async ({
    page,
  }) => {
    await signInAndGoto(page, './ships/fittings/compare');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);

    const STATS_TIMEOUT = { timeout: 20_000 };

    await addFitting(page, FIT_A);
    await expect(page.getByText('Fit A')).toBeVisible(STATS_TIMEOUT);

    await addFitting(page, FIT_B);
    await expect(page.getByText('Fit A')).toBeVisible(STATS_TIMEOUT);
    await expect(page.getByText('Fit B')).toBeVisible(STATS_TIMEOUT);
    await expect(page.getByText('Show differences only')).toBeVisible();

    await addFitting(page, FIT_C);
    const prev = page.getByRole('button', { name: 'Previous' });
    const next = page.getByRole('button', { name: 'Next' });
    await expect(prev).toBeVisible(STATS_TIMEOUT);
    expect(await prev.isDisabled()).toBe(true);
    const nextBox = await next.boundingBox();
    expect(nextBox!.height).toBeGreaterThanOrEqual(36);

    await expect(page.getByText('Fit A')).toBeVisible(STATS_TIMEOUT);
    await expect(page.getByText('Fit C')).not.toBeVisible();

    await next.click();
    await expect(page.getByText('Fit C')).toBeVisible();
    await expect(page.getByText('Fit A')).not.toBeVisible();
    expect(await prev.isDisabled()).toBe(false);

    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });
});

test.describe('Fitting Compare long names at 390px', () => {
  test('a long Fitting name keeps the Modules table inside its panel', async ({ page }) => {
    await signInAndGoto(page, './ships/fittings/compare');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);
    const longFit = [
      '[Merlin, Fit B With A Rather Long Name Indeed]',
      '125mm Gatling AutoCannon I',
      '125mm Gatling AutoCannon I',
    ].join(String.fromCharCode(10));
    await addFitting(page, FIT_A);
    await addFitting(page, longFit);
    const modules = page.locator('table').nth(1);
    await expect(modules.locator('thead th')).toHaveCount(3, { timeout: 20_000 });

    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);

    const table = (await modules.boundingBox())!;
    const remove = (await modules.locator('thead th').last().getByRole('button').boundingBox())!;
    expect(remove.x + remove.width).toBeLessThanOrEqual(table.x + table.width + 0.5);
  });
});

test.describe('Fitting Compare control toolbar', () => {
  const LABELS = ['Damage profile', 'Abyssal weather', 'Target profile'];

  async function gotoWithOneFit(page: Page) {
    await signInAndGoto(page, './ships/fittings/compare');
    await answerAnyType(page);
    await expect(page.getByTestId('compare-controls')).toHaveCount(0);
    await addFitting(page, FIT_A);
    await expect(page.getByTestId('compare-controls')).toBeVisible();
  }

  test('at 390 the Target profile summary reads as text, not a raw i18n key', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoWithOneFit(page);
    await expect(page.getByText(/\d+ m sig · \d+ m\/s/).first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\bfittings\.\w+\./);
  });

  test('at 1440 the three selects share one row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoWithOneFit(page);
    const ys: number[] = [];
    for (const name of LABELS) {
      const box = await page.getByRole('combobox', { name }).boundingBox();
      ys.push(box!.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });

  test('at 1024 the block is compact and each label sits beside its select', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoWithOneFit(page);
    const block = await page.getByTestId('compare-controls').boundingBox();
    expect(block!.height).toBeLessThan(70);
    for (const name of LABELS) {
      const select = await page.getByRole('combobox', { name }).boundingBox();
      const label = await page.getByText(name, { exact: true }).first().boundingBox();
      expect(select!.x - (label!.x + label!.width)).toBeLessThan(12);
    }
  });

  for (const width of [1440, 1024]) {
    test(`at ${width} loading three fits keeps the toolbar one row, toggle in Stats`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoWithOneFit(page);
      const controls = page.getByTestId('compare-controls');
      const one = (await controls.boundingBox())!.height;
      for (const eft of [FIT_B, FIT_C]) {
        await addFitting(page, `${eft}\n125mm Gatling AutoCannon I`);
      }
      await expect(page.locator('table')).toHaveCount(2, { timeout: 20_000 });
      expect(one).toBeLessThan(70);
      expect((await controls.boundingBox())!.height).toBeLessThanOrEqual(one + 1);
      const target = (await page.getByRole('combobox', { name: 'Target profile' }).boundingBox())!;
      const manage = (await page.getByRole('button', { name: /manage targets/i }).boundingBox())!;
      expect(
        Math.abs(manage.y + manage.height / 2 - (target.y + target.height / 2))
      ).toBeLessThanOrEqual(4);
      const toggle = page.getByText('Show differences only');
      await expect(toggle).toBeVisible();
      await expect(controls.getByText('Show differences only')).toHaveCount(0);
    });
  }
});

test.describe('Fitting Compare column alignment', () => {
  for (const size of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    for (const fits of [
      [FIT_A, FIT_B],
      [FIT_A, FIT_B, FIT_C],
    ]) {
      test(`${fits.length} fits line up between Stats and Modules at ${size.width}`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await signInAndGoto(page, './ships/fittings/compare');
        await answerAnyType(page);
        for (const [i, eft] of fits.entries()) {
          await addFitting(
            page,
            i === 0
              ? eft
              : `${eft}
125mm Gatling AutoCannon I`
          );
        }
        const tables = page.locator('table');
        await expect(tables).toHaveCount(2, { timeout: 20_000 });
        for (const index of [0, 1]) {
          await expect(tables.nth(index).locator('thead tr:first-child th')).toHaveCount(
            fits.length + 1,
            {
              timeout: 20_000,
            }
          );
        }
        const rights = async (index: number) =>
          tables
            .nth(index)
            .locator('thead tr:first-child th')
            .evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().right));
        const stats = await rights(0);
        const modules = await rights(1);
        expect(stats).toHaveLength(fits.length + 1);
        stats.forEach((right, i) => expect(Math.abs(right - modules[i]!)).toBeLessThanOrEqual(1));
      });
    }
  }
});

test.describe('Fitting Compare pinned names row', () => {
  test('keeps a slim row of Fitting names over their columns while the stats scroll at 1440', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAndGoto(page, './ships/fittings/compare');
    await answerAnyType(page);
    await addFitting(page, FIT_A);
    await addFitting(page, FIT_B);
    const table = page.locator('table').first();
    const pinned = table.getByTestId('compare-pinned-names');
    await expect(pinned).toBeVisible({ timeout: 20_000 });

    const firstRow = table.locator('tbody tr').first();
    await firstRow.evaluate((el) => {
      const bottom = el.getBoundingClientRect().bottom + window.scrollY;
      window.scrollTo(0, bottom + 1);
    });
    await expect(async () => {
      const row = await firstRow.boundingBox();
      expect(row!.y + row!.height).toBeLessThan(0);
    }).toPass();

    const box = (await pinned.locator('th').first().boundingBox())!;
    expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThan(40);

    const names = pinned.locator('th');
    const cells = table.locator('tbody tr').first().locator('td');
    for (const i of [1, 2]) {
      const nameBox = (await names.nth(i).boundingBox())!;
      const cellBox = (await cells.nth(i - 1).boundingBox())!;
      expect(Math.abs(nameBox.x + nameBox.width - (cellBox.x + cellBox.width))).toBeLessThanOrEqual(
        1
      );
    }
    await expect(names.nth(1)).toHaveText('Fit A');
    await expect(names.nth(2)).toHaveText('Fit B');
  });
});
