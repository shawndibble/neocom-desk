/**
 * Every route and every tab keeps its inline controls at one height (DESIGN.md
 * §3) — measured, because the rule written down kept slipping: a row would
 * pair a `sm` button with a `md` search box or select, and nothing caught it
 * until someone looked. See `support/controlHeights.ts` for what counts.
 *
 * Desktop and phone in one page load: the touch tier (`h-11`/`h-9`) is where
 * half the mismatches only show. A deliberate mismatch opts out with
 * `data-inline-height="exempt"`. Surfaces this fixture leaves empty (no rows,
 * no Community backend) are covered by their own specs, e.g.
 * `communitiesControlHeights.dev.spec.ts`.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectInlineControlsAligned } from './support/controlHeights';
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

const WIDTHS = [1280, 390];

for (const url of [...new Set([...ROUTES, ...TABS])]) {
  test(`${url}: inline controls share one height`, async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS[0], height: 900 });
    await signInAndGoto(page, url);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main .animate-spin')).toHaveCount(0, { timeout: 8000 });
      // `body`: a page's header actions and sheets sit outside `main`.
      await expectInlineControlsAligned(page, `${url} @${width}`, 'body');
    }
  });
}
