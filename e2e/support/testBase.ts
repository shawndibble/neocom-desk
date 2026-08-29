/**
 * Custom `test` wiring every spec through: a network guard that fails the
 * test if anything escapes to a real host, plus the SSO + ESI mocks layered
 * on top of it. Playwright tries routes most-recently-registered first and
 * `route.fallback()` defers to the next one down — so the guard is
 * registered FIRST (making it everyone else's fallback of last resort), and
 * the specific mocks are registered after (so they're tried before it).
 */
import { test as base, expect } from '@playwright/test';
import { installEsiMock } from './mockEsi';
import { installSsoMock } from './mockSso';

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture function;
   `use` is its teardown callback, not a React hook. */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const escaped: string[] = [];
    const allowedHost = new URL(baseURL!).host;

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

    await use(page);

    expect(escaped, `Real network reached (should be fully mocked): ${escaped.join(', ')}`).toEqual(
      []
    );
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect };
