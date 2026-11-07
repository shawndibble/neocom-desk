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
import type { Page } from '@playwright/test';
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

/**
 * Wait until the page has stopped loading: no spinner and no open-ended
 * progress bar. Some routes say "loading" with a bar rather than a spinner,
 * and show a different row once it ends: Item search shows its filter row
 * while the contract index downloads, then swaps it for the "couldn't reach"
 * state when the fixture's 404 lands. Measuring before that counts a funnel
 * that is about to unmount.
 */
async function waitForPageSettled(page: Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main .animate-spin')).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator('main [role="progressbar"]:not([aria-valuenow])')).toHaveCount(0, {
    timeout: 8000,
  });
}

for (const url of [...new Set([...ROUTES, ...TABS])]) {
  test(`${url}: inline controls share one height`, async ({ page }) => {
    await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
    await signInAndGoto(page, url);
    for (const width of CONTROL_ROW_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await waitForPageSettled(page);
      await expectInlineControlsAligned(page, `${url} @${width}`);
    }
  });
}

// The filter row opens behind its funnel, so the sweep above never sees it:
// open every page's funnel (desktop only; below `md` it is a sheet of stacked
// fields, not a row) and measure what is inside.
for (const url of [...new Set([...ROUTES, ...TABS])]) {
  test(`${url}: the open filters share one height`, async ({ page }) => {
    await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
    await signInAndGoto(page, url);
    await waitForPageSettled(page);
    const funnels = page.getByRole('button', { name: /^Filters/ });
    const count = await funnels.count();
    for (let i = 0; i < count; i += 1) {
      const funnel = funnels.nth(i);
      if (!(await funnel.isVisible())) continue;
      await funnel.click();
      await expectInlineControlsAligned(page, `${url} filters open (${i})`);
      await page.keyboard.press('Escape');
    }
  });
}

// Hauling's mixes selects with the two ISK fields (Max price per item, Max
// spend): one size across the lot. Desktop only — below `md` it is a sheet
// of stacked fields, not a row.
test('/market/hauling: the open filter row shares one height', async ({ page }) => {
  await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
  await signInAndGoto(page, '/market/hauling');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('textbox', { name: 'Max spend' })).toBeVisible();
  // A typed figure groups in the field itself: it must not lift its box out of the row.
  await page.getByRole('textbox', { name: 'Max price per item' }).fill('1000000');
  await expect(page.getByRole('textbox', { name: 'Max price per item' })).toHaveValue('1,000,000');
  await expectInlineControlsAligned(page, '/market/hauling filters open');
  const field = await page.getByRole('textbox', { name: 'Max price per item' }).boundingBox();
  const sells = await page.getByRole('combobox', { name: 'Sells within' }).boundingBox();
  expect(Math.abs(field!.y - sells!.y)).toBeLessThanOrEqual(1);
});

// Category and Sell give way before the route row wraps the funnel.
for (const width of [960, 1024]) {
  test(`/market/hauling @${width}: the filter funnel stays on the route row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAndGoto(page, '/market/hauling');
    const from = await page.getByRole('combobox', { name: 'From' }).boundingBox();
    const funnel = await page.getByRole('button', { name: /^Filters/ }).boundingBox();
    expect(Math.abs(funnel!.y + funnel!.height / 2 - (from!.y + from!.height / 2))).toBeLessThan(4);
  });
}
