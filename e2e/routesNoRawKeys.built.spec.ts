import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CORPORATION_ID } from './support/fixtureData';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from '../src/app/routeScopes';
import { PAGE_TABS } from '../src/app/pageTabs';
import { tabPath } from '../src/lib/pageTabs';
import { LAZY_SECTIONS, leafPaths, type LocaleTree } from '../src/i18n/localeSplit';

const en = JSON.parse(
  readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8')
) as LocaleTree;

const CONCRETE_PATH: Partial<Record<AppRoutePath, string>> = {
  '/skills/plans/:planId': '/skills/plans/e2e-missing-plan',
  '/industry/plans/:planId': '/industry/plans/e2e-missing-plan',
  '/industry/groups/:groupId': '/industry/groups/e2e-missing-group',
  '/wallet/lp-store/:corporationId': `/wallet/lp-store/${CORPORATION_ID}`,
  '/corp/assets/*': '/corp/assets/e2e-missing-location',
};

const PATHS = [
  ...new Set([
    ...(Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[]).map(
      (path) => CONCRETE_PATH[path] ?? path
    ),
    ...Object.values(PAGE_TABS).flatMap((page) => page.tabs.map((tab) => tabPath(page, tab.id))),
  ]),
];

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
    await expect(page.locator('.animate-spin'))
      .toHaveCount(0, { timeout: 10_000 })
      .catch(() => {});

    expect(await rawKeysOn(page), `raw translation keys on ${path}`).toEqual([]);
  });
}
