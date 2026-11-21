/**
 * `globalSetup` of `playwright.book.config.ts`: one real visit of the book's pages before the
 * first test, so no test pays a cold start inside its own 5-second waits.
 *
 * What a first page load waits on when everything is cold:
 * - the Functions emulator loading each function on its first call, and again for each call
 *   that arrives while a worker is busy (a page sends several at once): the token mint and the
 *   book's router, several seconds each;
 * - Vite compiling the officer and pilot routes' module graphs, and pre-bundling the
 *   dependencies it first meets there, which can reload the page;
 * - the Firestore emulator's first queries.
 *
 * A throwaway page load, or calls made by hand, covered only part of that. So this signs the
 * officer in on the same network the specs use (`installBookNetwork`), over a seeded book, and
 * opens a Miner's page, the Miners list, the Overview, Late notices, the pilot's Tax tab with its
 * ledger, and a verify link. Then it wipes the book; every test seeds its own.
 */
import { chromium, expect, type FullConfig, type Page } from '@playwright/test';
import { officerBook } from './bookScenarios';
import {
  installBookNetwork,
  minerUrl,
  routeBookEsi,
  signInAsOfficer,
  minerLedger,
} from './bookTest';
import { wipeFirestore, writeDocs } from './emulator';
import { OFFICER } from './identities';
import { PROJECT_ID } from './runEnv';

/** Generous on purpose: this is the cold start the tests' own waits must never see. */
const COLD_MS = 90_000;

async function visit(page: Page) {
  const book = officerBook();
  // The officer mines too, so their own Tax tab has the book as a Payee.
  book.seed.mine(OFFICER.id, [6, 5, 4]);
  await wipeFirestore();
  await writeDocs(book.seed.docs());
  await signInAsOfficer(page, minerUrl(book.id('bram')));
  await expect(minerLedger(page)).toBeVisible({
    timeout: COLD_MS,
  });
  for (const path of ['miners', 'overview', 'late-notices']) {
    await page.goto(`./corp/moons/${path}`);
    await expect(page.getByRole('tab', { selected: true })).toBeVisible({ timeout: COLD_MS });
  }
  await expect(page.getByRole('table', { name: 'Notices sent' })).toBeVisible({
    timeout: COLD_MS,
  });
  await page.goto('./mining/tax');
  await page
    .getByRole('button', { name: /^Open the ledger of / })
    .first()
    .click({ timeout: COLD_MS });
  await expect(page.getByRole('table', { name: 'Ledger' })).toBeVisible({ timeout: COLD_MS });
  await page.goto(`./corp-tax-book/verify/${'w'.repeat(43)}`);
  await expect(page.getByText('This link is not valid')).toBeVisible({ timeout: COLD_MS });
}

/**
 * The Functions emulator runs one call at a time per worker and starts a cold worker (over a
 * second) for each call that arrives while the warm ones are busy. A book page sends several at
 * once (the SRP status, the officer check twice, a settings write), so warm a pool of workers per
 * function: a call with no data is refused, but only once its worker has loaded.
 */
const FUNCTIONS = { corpTaxBookCall: 4, mintFirebaseToken: 2 };

async function warmWorkers() {
  await Promise.all(
    Object.entries(FUNCTIONS).flatMap(([name, workers]) =>
      Array.from({ length: workers }, () =>
        fetch(`http://127.0.0.1:5001/${PROJECT_ID}/us-central1/${name}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data: {} }),
        })
      )
    )
  );
}

export default async function warmUp(config: FullConfig): Promise<void> {
  await warmWorkers();
  const { baseURL, launchOptions } = config.projects[0].use;
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ baseURL });
    await installBookNetwork(page, baseURL!);
    await routeBookEsi(page);
    await visit(page);
  } finally {
    await browser.close();
    await wipeFirestore();
  }
}
