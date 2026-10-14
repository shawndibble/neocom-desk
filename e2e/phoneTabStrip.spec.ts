/**
 * Every page keeps its tab strip on a phone, as on desktop: no title-row view
 * picker, however many tabs (scope decision
 * `20261013-122802-phones-keep-the-tab-strip-no-view-picker`). The strip
 * scrolls sideways rather than widening the page.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 360, height: 800 };

const PAGES = [
  { name: 'Skills', path: './skills/plans', view: 'Trained', url: /\/skills\/trained/ },
  { name: 'Industry', path: './industry', view: 'BPC Sourcing', url: /\/industry\/sourcing/ },
  { name: 'Market', path: './market', view: 'Appraisal', url: /\/market\/appraisal/ },
  { name: 'Travel', path: './travel', view: 'Pilot Lookup', url: /\/travel\/pilot/ },
];

for (const { name, path, view, url } of PAGES) {
  test.describe(`${name} on a phone`, () => {
    test.beforeEach(async ({ page }) => {
      await signInAndGoto(page);
    });

    test('shows the tab strip at 360px without overflow', async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);

      const main = page.getByRole('main');
      // Skills' strip is route links in a `nav`; the others are `Tabs`.
      const target = main
        .getByRole('tab', { name: view, exact: true })
        .or(main.getByRole('link', { name: view, exact: true }));
      await expect(target).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: /Change view/ })).toHaveCount(0);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);

      await target.click();
      await expect(page).toHaveURL(url);
    });
  });
}
