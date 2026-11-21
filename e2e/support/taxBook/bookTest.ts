/**
 * `test` for the Corp Tax Book specs (`e2e/*.book.spec.ts`, run by `playwright.book.config.ts`).
 *
 * Same shape as `testBase.ts`: a network guard first, the SSO and ESI mocks over it, and a
 * failure if anything escaped. Two differences. The Firebase emulators are reachable, because
 * the book is read and written through the real rules and callables there. And the officer
 * signs in with a token the server can verify (`eveToken.ts`), holding the corp scopes and a
 * Director's roles, so the officer check, the mint and every live role check pass for real.
 *
 * Each test starts on an empty emulator: `book.seed(docs)` writes what the test needs.
 */
import { test as base, expect, type Page, type Route } from '@playwright/test';
import { signInAndGoto } from '../authSeed';
import { SCOPES } from '../fixtureData';
import { installEsiMock } from '../mockEsi';
import { installSsoMock } from '../mockSso';
import { scopesForGroup } from '../../../src/esi/scopes';
import { wipeFirestore, writeDocs, type SeedDoc } from './emulator';
import { signedAccessToken } from './eveToken';
import { REFINERY } from './bookSeed';
import { CORP, OFFICER, corpOf, nameOf } from './identities';
import { installFlatPrices } from './prices';
import { EMULATOR_HOSTS } from './runEnv';

/** The officer's grant: the suite's usual one plus the corp group (roles, wallet, mining ledger). */
export const OFFICER_SCOPES: readonly string[] = [
  ...new Set([...SCOPES, ...scopesForGroup('corp')]),
];

export interface Book {
  /** Writes the docs straight into the emulator (the server's own layout; see bookSeed.ts). */
  seed: (docs: readonly SeedDoc[]) => Promise<void>;
}

/** Per-test answers for a browser ESI path, tried before the defaults below. */
export type EsiOverride = (path: string, route: Route) => unknown;

export interface BookFixtures {
  book: Book;
  /** Answers more browser ESI paths: return undefined to fall through. */
  esi: (answer: EsiOverride) => void;
}

/**
 * Corp ESI the officer's pages read, with nothing in it unless a test says so: the book is in
 * Firestore, and what ESI holds would only be synced into it.
 */
function defaultCorpEsi(path: string, route: Route): unknown {
  if (path === `/characters/${OFFICER.id}/roles`) return { roles: ['Director'] };
  if (path === '/universe/names') {
    const ids = route.request().postDataJSON() as number[];
    return ids.map((id) =>
      id === CORP
        ? { id, name: 'Test Corp', category: 'corporation' }
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
  const corp = new RegExp(`^/corporations?/${CORP}/`);
  if (corp.test(path)) {
    if (path.endsWith('/divisions')) return { wallet: [{ division: 1, name: 'Master Wallet' }] };
    if (path.endsWith('/wallets')) return [{ division: 1, balance: 1_000_000_000 }];
    if (path.endsWith('/members')) return [OFFICER.id];
    // Journals, observers, extractions, structures, member tracking: empty.
    return [];
  }
  return undefined;
}

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture functions; `use` is not a hook. */
export const test = base.extend<BookFixtures>({
  esi: [
    async ({ page }, use) => {
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
      await use((answer) => overrides.unshift(answer));
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
    const escaped: string[] = [];
    const allowed = new Set([new URL(baseURL!).host, ...EMULATOR_HOSTS]);
    await page.route('**/*', async (route) => {
      if (allowed.has(new URL(route.request().url()).host)) return route.fallback();
      escaped.push(`${route.request().method()} ${route.request().url()}`);
      await route.abort('failed');
    });
    await installSsoMock(page, OFFICER_SCOPES);
    await installEsiMock(page);
    await installFlatPrices(page);
    // The officer's own synced data (`characters/char:<id>/...`): none. The emulator cannot run
    // these queries (docs/agents/testing-and-ci.md, "Known emulator noise"), and they are not
    // what these specs are about.
    await page.route(/127\.0\.0\.1:8080\/.*\/documents\/characters\/[^/]+:runQuery/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ readTime: new Date().toISOString() }]),
      })
    );
    await use(page);
    expect(escaped, `Real network reached (should be fully mocked): ${escaped.join(', ')}`).toEqual(
      []
    );
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect };

/** Signs the officer in (the server-verifiable token) and opens `path`. */
export async function signInAsOfficer(page: Page, path: string): Promise<void> {
  const token = signedAccessToken({
    characterId: OFFICER.id,
    name: OFFICER.name,
    ownerHash: OFFICER.ownerHash,
    scopes: OFFICER_SCOPES,
  });
  await signInAndGoto(page, path, OFFICER_SCOPES, [], token);
}

/** A Miner's page: `/corp/moons/miners/<minerId>`. */
export const minerUrl = (minerId: string): string =>
  `./corp/moons/miners/${encodeURIComponent(minerId)}`;

/**
 * Opens a Miner's page signed in as the officer and waits until the account is read (its
 * "Owed" figure), the signal that the officer check, the book read and the pricing are done.
 */
export async function openMiner(page: Page, minerId: string, name: string): Promise<void> {
  await signInAsOfficer(page, minerUrl(minerId));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Account ledger' })).toBeVisible();
}

/** The Miner page's figure beside a label ("Paid", "Oldest unpaid", "Last payment", ...). */
export function minerFact(page: Page, label: string) {
  return page
    .getByRole('main')
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');
}
