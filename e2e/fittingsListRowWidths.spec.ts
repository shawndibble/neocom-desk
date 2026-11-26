import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';
import { answerAnyType } from './support/universeTypes';

const RIFTER_EFT = [
  '[Rifter, Row Width Test]',
  '',
  '',
  '125mm Gatling AutoCannon I, EMP S',
  'Caldari Navy Heavy Missile Launcher, Scourge Heavy Missile',
  '',
  '',
  'Hobgoblin I x5',
].join('\n');

const NAMES = ['125mm Gatling AutoCannon I', 'Caldari Navy Heavy Missile Launcher', 'Hobgoblin I'];

const NAME_MIN_PX = 159;

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
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByLabel('Link or text').fill(RIFTER_EFT);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByText(NAMES[0], { exact: true }).first()).toBeVisible();

    for (const width of [390, 744, 768, 1024, 1280, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(async () => {
        for (const row of await measureRows(page)) {
          const at = `${row.name} at ${width}px`;
          expect(row.removeInside, at).toBe(true);
          if (!row.twoLine) expect(row.nameWidth, at).toBeGreaterThanOrEqual(NAME_MIN_PX);
          if (width === 390) expect(row.twoLine, at).toBe(true);
          if (width === 1920) expect(row.twoLine, at).toBe(false);
        }
      }).toPass({ timeout: 3000 });
      await expect(() => expectNoPageOverflow(page)).toPass({ timeout: 3000 });
    }
  });
});
