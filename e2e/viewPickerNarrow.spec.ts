/**
 * Pages with four or more tabs (Skills, Industry, Market) swap their tab strip
 * for a title-row view picker on a phone (issue #3268). Invariants only: no
 * tab strip, no horizontal overflow, the picker inside the viewport.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 360, height: 800 };
const DESKTOP = { width: 1280, height: 800 };

const PAGES = [
  {
    name: 'Skills',
    path: './skills/plans',
    page: 'Skills',
    view: 'Trained',
    url: /\/skills\/trained/,
  },
  {
    name: 'Industry',
    path: './industry',
    page: 'Industry',
    view: 'Records',
    url: /\/industry\/records/,
  },
  {
    name: 'Market',
    path: './market',
    page: 'Market',
    view: 'Appraisal',
    url: /\/market\/appraisal/,
  },
];

for (const { name, path, page: title, view, url } of PAGES) {
  test.describe(`${name} view picker`, () => {
    test.beforeEach(async ({ page }) => {
      await signInAndGoto(page);
    });

    test('replaces the tab strip at 360px without overflow', async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);

      const trigger = page.getByRole('button', { name: new RegExp(`^${title}, .*Change view`) });
      await expect(trigger).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('tab')).toHaveCount(0);

      const box = await trigger.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);

      await trigger.click();
      await page.getByRole('menuitemradio', { name: view, exact: true }).click();
      await expect(page).toHaveURL(url);
    });

    test('keeps the tab strip at 1280px', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(path);
      await expect(
        page.getByRole('tab', { name: view }).or(page.getByRole('link', { name: view }))
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /Change view/ })).toHaveCount(0);
    });
  });
}
