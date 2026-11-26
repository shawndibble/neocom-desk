import { chromium, expect, type FullConfig, type Page } from '@playwright/test';
import { officerBook } from './bookScenarios';
import { installBookNetwork, minerUrl, routeBookEsi, signInAsOfficer } from './bookTest';
import { wipeFirestore, writeDocs } from './emulator';
import { OFFICER } from './identities';
import { PROJECT_ID } from './runEnv';

const COLD_MS = 90_000;

async function visit(page: Page) {
  const book = officerBook();
  book.seed.mine(OFFICER.id, [6, 5, 4]);
  await wipeFirestore();
  await writeDocs(book.seed.docs());
  await signInAsOfficer(page, minerUrl(book.id('bram')));
  await expect(page.getByRole('table', { name: 'Ledger', exact: true })).toBeVisible({
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
