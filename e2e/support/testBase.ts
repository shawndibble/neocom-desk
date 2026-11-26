import { test as base, expect, type Page } from '@playwright/test';
import { installEsiMock } from './mockEsi';
import { installSsoMock } from './mockSso';

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

export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1280, height: 800 };
