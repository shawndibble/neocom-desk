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
import { installEsiMock } from '../mockEsi';
import { installSsoMock } from '../mockSso';
import { CORE_GRANT, scopesForGroup } from '../../../src/esi/scopes';
import { wipeFirestore, writeDocs, type SeedDoc } from './emulator';
import { signedAccessToken } from './eveToken';
import { REFINERY } from './bookSeed';
import { CORP, OFFICER, corpOf, nameOf } from './identities';
import { installFlatPrices } from './prices';
import { EMULATOR_HOSTS } from './runEnv';

/**
 * The officer's grant: the Core Grant and only the Permissions the book's pages use (the pilot's
 * details, which name them; corp roles,
 * wallets and ledgers; the pilot's own mining and wallet; mail to send late notices). Not the
 * suite's full grant: at boot the app warms every granted endpoint, and with all of them the
 * corp role lookup the officer check waits on queued behind ~25 personal reads, pushing a book
 * page's first render to the edge of a test's 5-second wait.
 */
export const OFFICER_SCOPES: readonly string[] = [
  ...new Set([
    ...CORE_GRANT,
    ...(['characterDetails', 'corp', 'mining', 'wallet', 'mailSend'] as const).flatMap((group) =>
      scopesForGroup(group)
    ),
  ]),
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
    // Journals, observers, extractions, structures, member tracking: empty.
    return [];
  }
  return undefined;
}

/**
 * The network every book page runs on, for one page: the guard (only the app's server and the
 * emulators), the SSO and ESI mocks, flat prices, and no synced data of the officer's own.
 * Returns the requests that escaped, for the caller to assert empty. The `page` fixture and the
 * run's warm-up (`warmUp.ts`) both use it.
 */
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
  // Nor does it write any: the app's own sync commits only under `characters/`, and its reads of
  // those docs find none. (Book reads are batchGets of `corps/` docs, and book writes are all
  // callables, so neither is touched.)
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

/**
 * The corp ESI the officer's pages read (`defaultCorpEsi`), answered before the general mock.
 * Returns how to add a test's own answers, tried first.
 */
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
  // Two signals in their order: the book read (the ledger), then the Miner's name, which ESI
  // resolves only after it.
  await expect(minerLedger(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** The Miner page's figure beside a label ("Paid", "Oldest unpaid", "Last payment", ...). */
export function minerFact(page: Page, label: string) {
  return page
    .getByRole('main')
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');
}

/**
 * The Miner page's ledger table. Named by the book ("Account ledger", soon "Ledger", the name the
 * pilot's ledger already has), so the pattern takes either and survives the rename.
 */
export const minerLedger = (page: Page) =>
  page.getByRole('main').getByRole('table', { name: /^(Account ledger|Ledger)$/ });
