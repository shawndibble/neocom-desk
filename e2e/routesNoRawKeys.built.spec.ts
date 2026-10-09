/**
 * No route renders a raw translation key in the **built** bundle.
 *
 * The production build splits `en.json` (`src/i18n/localeSplit.ts`): the
 * shell half loads at boot, and every other key registers as the chunk that
 * names it loads. Dev and Vitest load the whole file, so this project is the
 * only place anything renders through the split. A key the scan missed would
 * reach the screen as i18next's fallback, the key itself
 * (`market.orders.fillsIn`), and nothing else in CI would notice.
 *
 * Every route and every tab (the same list `coreOnlyCharacterSweep.spec.ts`
 * walks) with the full fixture grant, checking visible text, the document
 * title and the accessible-name attributes. Only strings that really are keys
 * in `en.json` count as a hit, so data that merely looks like one (a host
 * name such as `market.fuzzwork.co.uk`) cannot fail the spec.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CORPORATION_ID } from './support/fixtureData';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from '../src/app/routeScopes';
import { PAGE_TABS } from '../src/app/pageTabs';
import { tabPath } from '../src/lib/pageTabs';
import { LAZY_SECTIONS, leafPaths, type LocaleTree } from '../src/i18n/localeSplit';

// Read, not imported: Playwright's ESM loader wants an import attribute for JSON.
const en = JSON.parse(
  readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8')
) as LocaleTree;

const CONCRETE_PATH: Partial<Record<AppRoutePath, string>> = {
  '/skills/plans/:planId': '/skills/plans/e2e-missing-plan',
  '/industry/plans/:planId': '/industry/plans/e2e-missing-plan',
  '/industry/groups/:groupId': '/industry/groups/e2e-missing-group',
  '/market/lp-store/:corporationId': `/market/lp-store/${CORPORATION_ID}`,
  '/corp/assets/*': '/corp/assets/e2e-missing-location',
};

// A path can be both a route and a tab (`/market/lp-store`), so the list is de-duplicated.
const PATHS = [
  ...new Set([
    ...(Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[]).map(
      (path) => CONCRETE_PATH[path] ?? path
    ),
    ...Object.values(PAGE_TABS).flatMap((page) => page.tabs.map((tab) => tabPath(page, tab.id))),
  ]),
];

/** Every lazy key, plus the plural base i18next falls back to (`items` for `items_one`). */
const KEYS = new Set(
  leafPaths(en, LAZY_SECTIONS).flatMap((key) => [
    key,
    key.replace(/_(zero|one|two|few|many|other)$/, ''),
  ])
);
const CANDIDATE = new RegExp(
  `\\b(?:${[...LAZY_SECTIONS].sort((a, b) => b.length - a.length).join('|')})(?:\\.[\\w-]+)+`,
  'g'
);

async function rawKeysOn(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() => {
    const attributes = Array.from(
      document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')
    ).flatMap((element) =>
      ['aria-label', 'title', 'placeholder', 'alt'].map((name) => element.getAttribute(name) ?? '')
    );
    return [document.title, document.body.innerText, ...attributes];
  });
  const hits = new Set<string>();
  for (const text of texts) {
    for (const [candidate] of text.matchAll(CANDIDATE))
      if (KEYS.has(candidate)) hits.add(candidate);
  }
  return [...hits].sort();
}

for (const path of PATHS) {
  test(`${path} renders no raw translation key`, async ({ page }) => {
    // Lists `mockEsi.ts` leaves unanswered (specs that need them seed their
    // own); empty is enough to render the page's chrome.
    await page.route(
      (url) => /\/(contacts\/labels|mail\/lists)$/.test(url.pathname),
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await signInAndGoto(page, path);
    const main = page.locator('main');
    await expect(main).toBeVisible();
    await expect
      .poll(async () => (await main.textContent())?.trim().length ?? 0, {
        message: `${path} rendered no visible text at all`,
      })
      .toBeGreaterThan(0);
    // Let lazy panels inside the route land. Not an assertion: a route may
    // legitimately keep a spinner (a slow mocked call) and still be checkable.
    await expect(page.locator('.animate-spin'))
      .toHaveCount(0, { timeout: 10_000 })
      .catch(() => {});

    expect(await rawKeysOn(page), `raw translation keys on ${path}`).toEqual([]);
  });
}
