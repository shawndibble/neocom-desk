/**
 * BPC Sourcing's multi-type price cell at 390px (issue #1165).
 *
 * `DataTable`'s stacked-card CSS (`.dt-stack td { text-align: left }`) can
 * override a column's own `align: 'right'`, but cannot reach alignment a
 * cell renders for itself — the multi-type price cell wraps its amount and
 * a "whole contract" caption in its own `flex flex-col items-end`, which
 * right-hugs the stacked card regardless of viewport. The fix gates that
 * cross-axis alignment behind `sm:` (`items-start sm:items-end`), matching
 * every other stacked field's left-gutter start below `sm` while leaving the
 * desktop table's right alignment untouched.
 *
 * Asserted directly on `getComputedStyle(...).alignItems` — the exact
 * property `.dt-stack td`'s `text-align` cannot reach — rather than a
 * gutter-comparison technique: it is the literal property this fix flips,
 * and the acceptance criteria for this ticket are phrased in exactly these
 * terms.
 *
 * ## Why this spec stubs one module
 *
 * Same trade `contractSearchCourierNarrow.spec.ts` documents: BPC Sourcing's
 * contract rows come from a shared, sync-gated Public Contract Offers
 * snapshot (`syncedContracts.ts`), gated on `isSyncConfigured()` — shut for
 * every E2E spec since Firebase env vars are blanked on purpose (see
 * `playwright.config.ts`). The dev server's own `@/app/syncStatus` module is
 * served back as a two-line stub to open that gate, and Firebase's real
 * hosts are refused so the snapshot loader falls through to the Dexie copy
 * seeded below, rather than reaching the real cloud.
 */
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import type { Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Rifter Blueprint — a real blueprint typeId out of `public/data/blueprints.json`. */
const BLUEPRINT_TYPE_ID = 691;
const JITA_4_4 = 60003760;
const THE_FORGE = 10000002;

function multiTypeContractRow() {
  return {
    contractId: 5_000_001,
    regionId: THE_FORGE,
    locationId: JITA_4_4,
    typeId: BLUEPRINT_TYPE_ID,
    price: 50_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 1,
    quantity: 1,
    dateExpired: Date.now() + 7 * 24 * 60 * 60 * 1000,
    isMultiType: true,
  };
}

function singleTypeContractRow() {
  return { ...multiTypeContractRow(), contractId: 5_000_002, isMultiType: false };
}

/** Same shape `syncedContracts.ts` writes into `esi/cache.ts`'s `esiCache` store. */
async function seedBpcSnapshot(page: Page, rows: unknown[]): Promise<void> {
  await page.evaluate(
    async ({ seeded, regionId, regionName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('esiCache', 'readwrite');
        tx.objectStore('esiCache').put({
          characterId: 0,
          key: 'publicContractOffers',
          value: { rows: seeded, lastSyncedAt: now },
          fetchedAt: now,
        });
        // `regionNames.ts`'s own cache row — pre-seeded so the "Location"
        // column's region name resolves from Dexie rather than a real,
        // unmocked GET to ESI's public /universe/regions/{id}.
        tx.objectStore('esiCache').put({
          characterId: 0,
          key: `bpc-region:${regionId}`,
          value: { name: regionName },
          fetchedAt: now,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { seeded: rows, regionId: THE_FORGE, regionName: 'The Forge' }
  );
}

/** The gate described at the top of this file, opened for this page only. */
async function stubSyncConfigured(page: Page): Promise<void> {
  await page.route('**/src/app/syncStatus.ts*', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      body: [
        'export function isSyncConfigured() { return true; }',
        'export function syncDisplayState(status, online) {',
        "  return online ? status.state : 'offline';",
        '}',
        '',
      ].join('\n'),
    });
  });
}

/** Firebase now reads as configured — refused so the snapshot loader falls through to the Dexie row seeded above, same trade `contractSearchCourierNarrow.spec.ts` makes. */
async function refuseSyncBackend(page: Page): Promise<void> {
  const SYNC_HOSTS = [
    'https://*.googleapis.com/**',
    'https://*.cloudfunctions.net/**',
    'https://*.firebaseio.com/**',
    'https://*.gstatic.com/**',
  ];
  for (const pattern of SYNC_HOSTS) {
    await page.route(pattern, (route) => route.abort('failed'));
  }
}

async function priceWrapperAlignItems(page: Page): Promise<string> {
  const table = page.getByRole('table', { name: 'BPC Search' });
  const priceCell = table.locator('tbody tr').first().locator('td[data-label="Price"]');
  await expect(priceCell).toContainText('Whole contract');
  return priceCell.evaluate((cell) => {
    const wrapper = cell.querySelector(':scope > span');
    if (!wrapper) throw new Error('Price cell has no wrapper span');
    return getComputedStyle(wrapper).alignItems;
  });
}

test.describe('BPC Sourcing — multi-type price cell alignment', () => {
  test('starts at the card label gutter below sm', async ({ page }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);
    await page.setViewportSize(PHONE);

    await loginAndSelectCharacter(page);
    await seedBpcSnapshot(page, [multiTypeContractRow()]);

    await page.goto('./industry?tab=sourcing');

    expect(await priceWrapperAlignItems(page)).toBe('flex-start');
  });

  test('stays right-aligned at and above sm', async ({ page }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);
    await page.setViewportSize(DESKTOP);

    await loginAndSelectCharacter(page);
    await seedBpcSnapshot(page, [multiTypeContractRow()]);

    await page.goto('./industry?tab=sourcing');

    expect(await priceWrapperAlignItems(page)).toBe('flex-end');
  });

  test('a non-multi-type row never renders the wrapper, at any width', async ({ page }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);
    await page.setViewportSize(PHONE);

    await loginAndSelectCharacter(page);
    await seedBpcSnapshot(page, [singleTypeContractRow()]);

    await page.goto('./industry?tab=sourcing');

    const table = page.getByRole('table', { name: 'BPC Search' });
    const priceCell = table.locator('tbody tr').first().locator('td[data-label="Price"]');
    await expect(priceCell).toBeVisible();
    await expect(priceCell).not.toContainText('Whole contract');
    // `IskAmount` renders its own direct-child `<span>` (the long-press
    // reveal target) — a non-multi-type row still has one of those, so the
    // absence of the *flex* wrapper is what distinguishes it, not "no span
    // at all".
    const wrapperCount = await priceCell.locator(':scope > span.flex').count();
    expect(wrapperCount, 'a non-multi-type row should render a plain value, no flex wrapper').toBe(
      0
    );
  });
});
