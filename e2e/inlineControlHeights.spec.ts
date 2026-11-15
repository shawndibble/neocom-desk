/**
 * A sample of toolbars keeps its inline controls at one height (DESIGN.md §3),
 * measured in the browser: a `Link` styled with `buttonClassName`, a hand-built
 * control or a row laid out by a component is invisible to the static guard
 * (`src/components/ui/inlineControlSizes.test.ts`), which checks every source
 * file's rows of `src/components/ui` controls. See `support/controlHeights.ts`
 * for what counts.
 *
 * This used to load every route and tab, and kept failing on pages measured
 * mid-load; the sample is pages whose toolbars mix searches, selects, chips and
 * buttons. Each measurement polls until the page has settled (no spinner, no
 * open-ended progress bar, fonts loaded) and the row is aligned.
 *
 * Desktop and phone in one page load: the touch tier (`h-9`) is where half the
 * mismatches only show. A deliberate mismatch opts out with
 * `data-inline-height="exempt"`. Surfaces this fixture leaves empty (no rows, no
 * Community backend) are covered by their own specs, e.g.
 * `communitiesControlHeights.dev.spec.ts`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockFlatHubPrices } from './support/piPrices';
import {
  CONTROL_ROW_WIDTHS,
  expectInlineControlsAligned,
  findControlHeightMismatches,
} from './support/controlHeights';

/** Toolbars that mix a search, selects, chips, a funnel and buttons. */
const SAMPLE = [
  '/assets',
  '/contracts',
  '/market/orders',
  '/market/hauling',
  '/wallet/journal',
  '/industry',
  '/skills/certificates',
  '/corp/assets',
];

/** No spinner and no open-ended progress bar in `main`, in one locator. */
const LOADING = 'main .animate-spin, main [role="progressbar"]:not([aria-valuenow])';

/**
 * Polls until the page has settled and its rows line up: a page measured while a
 * spinner, a progress bar or a web font is still landing reads a false mismatch,
 * or a row that has not rendered yet.
 */
async function expectSettledAndAligned(page: Page, label: string): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        if ((await page.locator(LOADING).count()) > 0) return ['still loading'];
        return findControlHeightMismatches(page, 'body');
      },
      {
        message: `${label}: inline controls of different heights (DESIGN.md §3 — one size per row)`,
        // A cold dev server compiles each page on first load; the settle is most of this.
        timeout: 15_000,
      }
    )
    .toEqual([]);
}

/**
 * Hauling's scan prices every candidate type at both hubs. The shared Fuzzwork
 * fixture prices none of them, so the app reads Fuzzwork as having nothing; ESI
 * order books are capped far below that many types, so it falls back to R2's
 * Open Prices one type at a time (shard, then the type's own object) and the
 * spinner outlasts the settle wait. One flat price everywhere: Fuzzwork answers,
 * there is no margin between the hubs, and the scan settles on its empty result.
 */
async function signInAndGotoPriced(page: Page, url: string): Promise<void> {
  if (url.startsWith('/market/hauling')) await mockFlatHubPrices(page, { buy: 5, sell: 5 });
  await signInAndGoto(page, url);
}

for (const url of SAMPLE) {
  test(`${url}: inline controls share one height`, async ({ page }) => {
    await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
    await signInAndGotoPriced(page, url);
    for (const width of CONTROL_ROW_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectSettledAndAligned(page, `${url} @${width}`);
    }
  });

  // The filter row opens behind its funnel, so the check above never sees it.
  // Desktop only: below `md` it is a sheet of stacked fields, not a row.
  test(`${url}: the open filters share one height`, async ({ page }) => {
    await page.setViewportSize({ width: CONTROL_ROW_WIDTHS[0], height: 900 });
    await signInAndGotoPriced(page, url);
    await expectSettledAndAligned(page, url);
    const funnels = page.getByRole('button', { name: /^Filters/ });
    const count = await funnels.count();
    for (let i = 0; i < count; i += 1) {
      const funnel = funnels.nth(i);
      if (!(await funnel.isVisible())) continue;
      await funnel.click();
      await expectSettledAndAligned(page, `${url} filters open (${i})`);
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
