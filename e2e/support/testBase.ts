/**
 * Custom `test` wiring every spec through: a network guard that fails the
 * test if anything escapes to a real host, plus the SSO + ESI mocks layered
 * on top of it. Playwright tries routes most-recently-registered first and
 * `route.fallback()` defers to the next one down — so the guard is
 * registered FIRST (making it everyone else's fallback of last resort), and
 * the specific mocks are registered after (so they're tried before it).
 */
import { test as base, expect, type Page } from '@playwright/test';
import { installEsiMock } from './mockEsi';
import { installSsoMock } from './mockSso';

/**
 * The guard plus the mocks, for one page. Returns the requests that escaped
 * to a real host, for the caller to assert empty once the page is done —
 * the `page` fixture below does, and a spec that opens a second tab
 * (`tabLeader.spec.ts`) calls this for it.
 */
export async function installMockedNetwork(page: Page, baseURL: string): Promise<string[]> {
  const escaped: string[] = [];
  const allowedHost = new URL(baseURL).host;

  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.host === allowedHost) {
      await route.fallback();
      return;
    }
    escaped.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort('failed');
  });

  await installSsoMock(page);
  await installEsiMock(page);
  return escaped;
}

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture function;
   `use` is its teardown callback, not a React hook. */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const escaped = await installMockedNetwork(page, baseURL!);

    await use(page);

    expect(escaped, `Real network reached (should be fully mocked): ${escaped.join(', ')}`).toEqual(
      []
    );
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect };

/**
 * The two viewports the specs share. A spec that needs a different size —
 * `phoneTabStrip` at 360 wide, the 1440-wide specs, `settingsPhoneTabBar`'s
 * `DESKTOP_SIZES` — keeps its own, because the size is what it is testing.
 * `DESKTOP` is also `playwright.config.ts`'s own default viewport, so a spec
 * uses it to get back to the project default after a `PHONE` resize.
 */
export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1280, height: 800 };
