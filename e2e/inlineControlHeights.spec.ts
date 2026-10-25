/**
 * Every route and every tab keeps its inline controls at one height (DESIGN.md
 * §3) — measured, because the rule written down kept slipping: a row would
 * pair a `sm` button with a `md` search box or select, and nothing caught it
 * until someone looked. See `support/controlHeights.ts` for what counts.
 *
 * Desktop and phone in one page load: the touch tier (`h-9`) is where
 * half the mismatches only show. A deliberate mismatch opts out with
 * `data-inline-height="exempt"`. Surfaces this fixture leaves empty (no rows,
 * no Community backend) are covered by their own specs, e.g.
 * `communitiesControlHeights.dev.spec.ts`.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CONTROL_ROW_WIDTHS, expectInlineControlsAligned } from './support/controlHeights';
import { ROUTE_REQUIREMENTS } from '../src/app/routeScopes';
import { PAGE_TABS } from '../src/app/pageTabs';
import { tabPath } from '../src/lib/pageTabs';

/** Static routes only: a dynamic one would render its redirect or not-found state. */
const ROUTES = Object.keys(ROUTE_REQUIREMENTS).filter(
  (path) => !path.includes(':') && !path.includes('*')
);
const TABS = Object.values(PAGE_TABS).flatMap((page) =>
  page.tabs.map((tab) => tabPath(page, tab.id))
);

for (const url of [...new Set([...ROUTES, ...TABS])]) {
  test(`${url}: inline controls share one height`, async ({ page }) => {
    await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
    await signInAndGoto(page, url);
    for (const width of CONTROL_ROW_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main .animate-spin')).toHaveCount(0, { timeout: 8000 });
      await expectInlineControlsAligned(page, `${url} @${width}`);
    }
  });
}

// The filter row opens behind its funnel, so the sweep above never sees it.
// Hauling's mixes selects with the two ISK fields (Max price per item, Max
// spend): one size across the lot. Desktop only — below `md` it is a sheet
// of stacked fields, not a row.
test('/market/hauling: the open filter row shares one height', async ({ page }) => {
  await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
  await signInAndGoto(page, '/market/hauling');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('textbox', { name: 'Max spend' })).toBeVisible();
  // A typed figure shows its full-ISK echo: it must not lift its box out of the row.
  await page.getByRole('textbox', { name: 'Max price per item' }).fill('1000');
  await expect(page.getByText('= 1,000 ISK')).toBeVisible();
  await expectInlineControlsAligned(page, '/market/hauling filters open');
  const field = await page.getByRole('textbox', { name: 'Max price per item' }).boundingBox();
  const sells = await page.getByRole('combobox', { name: 'Sells within' }).boundingBox();
  expect(Math.abs(field!.y - sells!.y)).toBeLessThanOrEqual(1);
});

// Category and Sell by give way before the route row wraps the funnel.
for (const width of [960, 1024]) {
  test(`/market/hauling @${width}: the filter funnel stays on the route row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAndGoto(page, '/market/hauling');
    const from = await page.getByRole('combobox', { name: 'From' }).boundingBox();
    const funnel = await page.getByRole('button', { name: /^Filters/ }).boundingBox();
    expect(Math.abs(funnel!.y + funnel!.height / 2 - (from!.y + from!.height / 2))).toBeLessThan(4);
  });
}
