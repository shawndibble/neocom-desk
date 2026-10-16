/**
 * Fitter List rows (issue #3961): a fitted item's name never gets squeezed to
 * a sliver by its controls. Each row is either one line with the name at least
 * 10rem wide and its remove button inside the card, or the two-line layout
 * with the name on a line of its own. Invariants only — no pixel layout is
 * pinned, since CI's fonts differ.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

/** The shared ESI mock only carries a few fixture types — answer for any id. */
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

const RIFTER_EFT = [
  '[Rifter, Row Width Test]',
  '',
  '',
  '125mm Gatling AutoCannon I, EMP S',
  '',
  '',
  'Hobgoblin I x5',
].join('\n');

const NAMES = ['125mm Gatling AutoCannon I', 'Hobgoblin I'];

/** Each named row's layout: one line or two, the name's width, and whether remove spills out. */
async function measureRows(page: Page) {
  return page.evaluate((names) => {
    return names.map((name) => {
      const label = [...document.querySelectorAll('a, span')].find(
        (el) => el.textContent === name && el.closest('.\\@container')
      )!;
      const card = label.closest('.\\@container')!;
      const box = label.getBoundingClientRect();
      const control = card.querySelector('select, [role="group"]')!.getBoundingClientRect();
      const remove = card.querySelector('button[aria-label^="Remove"]')!.getBoundingClientRect();
      return {
        name,
        twoLine: control.top >= box.bottom,
        nameWidth: box.width,
        removeInside: remove.right <= card.getBoundingClientRect().right + 0.5,
      };
    });
  }, NAMES);
}

test.describe('Fitter List rows', () => {
  test('keep names readable at every width', async ({ page }) => {
    await signInAndGoto(page, './ships/fittings');
    await answerAnyType(page);
    await page.getByRole('button', { name: 'Import…', exact: true }).click();
    await page.getByLabel('Link or text').fill(RIFTER_EFT);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('tab', { name: 'List', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'List' })).toBeVisible();
    await expect(page.getByText(NAMES[0], { exact: true }).first()).toBeVisible();

    for (const width of [390, 768, 1024, 1280, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(async () => {
        for (const row of await measureRows(page)) {
          const at = `${row.name} at ${width}px`;
          expect(row.removeInside, at).toBe(true);
          if (!row.twoLine) expect(row.nameWidth, at).toBeGreaterThanOrEqual(159);
        }
      }).toPass({ timeout: 3000 });
      const rows = await measureRows(page);
      if (width === 390) expect(rows.every((row) => row.twoLine)).toBe(true);
      if (width === 1920) expect(rows.every((row) => !row.twoLine)).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      ).toBe(true);
    }
  });
});
