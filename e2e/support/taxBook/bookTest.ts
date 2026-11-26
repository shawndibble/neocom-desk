import { test as base, expect, type Page, type Route } from '@playwright/test';
import { signInAndGoto } from '../authSeed';
import { installEsiMock } from '../mockEsi';
import { installSsoMock } from '../mockSso';
import { CORE_GRANT, scopesForGroup } from '../../../src/esi/scopes';
import { wipeFirestore, writeDocs, type SeedDoc } from './emulator';
import { signedAccessToken } from './eveToken';
import { REFINERY } from './bookSeed';
import { CORP, OFFICER, OTHER_CORP, corpOf, nameOf } from './identities';
import { installFlatPrices } from './prices';
import { EMULATOR_HOSTS } from './runEnv';

export const OFFICER_SCOPES: readonly string[] = [
  ...new Set([
    ...CORE_GRANT,
    ...(['characterDetails', 'corp', 'mining', 'wallet', 'mailSend'] as const).flatMap((group) =>
      scopesForGroup(group)
    ),
  ]),
];

export interface Book {
  seed: (docs: readonly SeedDoc[]) => Promise<void>;
}

export type EsiOverride = (path: string, route: Route) => unknown;

export interface BookFixtures {
  book: Book;
  esi: (answer: EsiOverride) => void;
}

function defaultCorpEsi(path: string, route: Route): unknown {
  if (path === `/characters/${OFFICER.id}/roles`) return { roles: ['Director'] };
  if (path === '/universe/names') {
    const ids = route.request().postDataJSON() as number[];
    return ids.map((id) =>
      id === CORP
        ? { id, name: 'Test Corp', category: 'corporation' }
        : id === OTHER_CORP
          ? { id, name: 'Other Corp', category: 'corporation' }
          : { id, name: nameOf(id), category: 'character' }
    );
  }
  if (path === '/characters/affiliation') {
    const ids = route.request().postDataJSON() as number[];
    return ids.map((id) => ({ character_id: id, corporation_id: corpOf(id) }));
  }
  const structure = /^\/universe\/structures\/(\d+)\/?$/.exec(path);
  if (structure) {
    const refinery = Object.values(REFINERY).find((r) => r.id === Number(structure[1]));
    if (refinery) {
      return {
        name: refinery.name,
        solar_system_id: refinery.systemId,
        type_id: 35835,
        owner_id: CORP,
      };
    }
  }
  const system = /^\/universe\/systems\/(\d+)$/.exec(path);
  const named = system && Object.values(REFINERY).find((r) => r.systemId === Number(system[1]));
  if (named) {
    return {
      system_id: named.systemId,
      name: named.systemName,
      security_status: -0.2,
      constellation_id: 20000001,
      star_id: 40000001,
    };
  }
  const corp = new RegExp(`^/corporations?/${CORP}/`);
  if (corp.test(path)) {
    if (path.endsWith('/divisions')) return { wallet: [{ division: 1, name: 'Master Wallet' }] };
    if (path.endsWith('/wallets')) return [{ division: 1, balance: 1_000_000_000 }];
    if (path.endsWith('/members')) return [OFFICER.id];
    return [];
  }
  return undefined;
}

export async function installBookNetwork(page: Page, baseURL: string): Promise<string[]> {
  const escaped: string[] = [];
  const allowed = new Set([new URL(baseURL).host, ...EMULATOR_HOSTS]);
  await page.route('**/*', async (route) => {
    if (allowed.has(new URL(route.request().url()).host)) return route.fallback();
    escaped.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort('failed');
  });
  await installSsoMock(page, OFFICER_SCOPES);
  await installEsiMock(page);
  await installFlatPrices(page);
  await page.route(/127\.0\.0\.1:8080\/.*\/documents\/characters\/[^/]+:runQuery/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ readTime: new Date().toISOString() }]),
    })
  );
  await page.route(/127\.0\.0\.1:8080\/.*\/documents:(commit|batchGet)/, (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes('/documents/characters/')) return route.fallback();
    const now = new Date().toISOString();
    if (route.request().url().includes(':commit')) {
      const writes = (JSON.parse(body) as { writes?: unknown[] }).writes ?? [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          writeResults: writes.map(() => ({ updateTime: now })),
          commitTime: now,
        }),
      });
    }
    const docs = (JSON.parse(body) as { documents?: string[] }).documents ?? [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(docs.map((missing) => ({ missing, readTime: now }))),
    });
  });
  return escaped;
}

export async function routeBookEsi(page: Page): Promise<(answer: EsiOverride) => void> {
  const overrides: EsiOverride[] = [];
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/latest/, '')
      .replace(/\/$/, '');
    for (const answer of [...overrides, defaultCorpEsi]) {
      const body = answer(path, route);
      if (body !== undefined) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      }
    }
    return route.fallback();
  });
  return (answer) => overrides.unshift(answer);
}

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture functions; `use` is not a hook. */
export const test = base.extend<BookFixtures>({
  esi: [
    async ({ page }, use) => {
      await use(await routeBookEsi(page));
    },
    { auto: true },
  ],
  book: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern: none.
    async ({}, use) => {
      await wipeFirestore();
      await use({ seed: writeDocs });
    },
    { auto: true },
  ],
  page: async ({ page, baseURL }, use) => {
    const escaped = await installBookNetwork(page, baseURL!);
    await use(page);
    expect(escaped, `Real network reached (should be fully mocked): ${escaped.join(', ')}`).toEqual(
      []
    );
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect };

export async function signInAsOfficer(page: Page, path: string): Promise<void> {
  const token = signedAccessToken({
    characterId: OFFICER.id,
    name: OFFICER.name,
    ownerHash: OFFICER.ownerHash,
    scopes: OFFICER_SCOPES,
  });
  await signInAndGoto(page, path, OFFICER_SCOPES, [], token);
}

export const minerUrl = (minerId: string): string =>
  `./corp/moons/miners/${encodeURIComponent(minerId)}`;

export async function openMiner(page: Page, minerId: string, name: string): Promise<void> {
  await signInAsOfficer(page, minerUrl(minerId));
  await expect(page.getByRole('table', { name: 'Ledger', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export function minerFact(page: Page, label: string) {
  return page
    .getByRole('main')
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');
}
