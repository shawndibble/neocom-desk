/**
 * BPC Sourcing's multi-type price cell at 390px (issue #1165).
 *
 * Since the phone card went dense, Price is the card's headline figure at
 * the right end of its title line (`cardCorner`), so the wrapper now hugs
 * the right at every width; before, as one labelled field among five, it
 * had to start at the label gutter below `sm`.
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
 */
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import type { Page } from '@playwright/test';

/**
 * The first assertion after `goto`: a cold load on a CI runner (then on the dev server) was seen
 * taking ~6s just to serve the Industry route's module graph, past
 * Playwright's default 5s, with the page still on its route spinner.
 */
const COLD_LOAD = { timeout: 15_000 };

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

/** Repro numbers: a 1-run copy priced under a 10-run copy that's cheaper per run. */
function cheapestPerRunOffers() {
  const base = singleTypeContractRow();
  return [
    { ...base, contractId: 7_000_001, price: 6_000_000, runs: 1 },
    { ...base, contractId: 7_000_002, price: 9_500_000, runs: 10 },
    { ...base, contractId: 7_000_003, price: 12_000_000, runs: 10 },
  ];
}

/** Same shape `syncedContracts.ts` writes into `esi/cache.ts`'s `esiCache` store. */
async function seedBpcSnapshot(
  page: Page,
  rows: unknown[],
  regions: readonly (readonly [number, string])[] = [[THE_FORGE, 'The Forge']]
): Promise<void> {
  await page.evaluate(
    async ({ seeded, regionNames }) => {
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
        for (const [regionId, regionName] of regionNames) {
          tx.objectStore('esiCache').put({
            characterId: 0,
            key: `bpc-region:${regionId}`,
            value: { name: regionName },
            fetchedAt: now,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { seeded: rows, regionNames: regions }
  );
}

async function priceWrapperAlignItems(page: Page): Promise<string> {
  const table = page.getByRole('table', { name: 'BPC Sourcing' });
  const priceCell = table.locator('tbody tr').first().locator('td[data-label="Price"]');
  await expect(priceCell).toContainText('Whole contract', COLD_LOAD);
  return priceCell.evaluate((cell) => {
    const wrapper = cell.querySelector(':scope > span');
    if (!wrapper) throw new Error('Price cell has no wrapper span');
    return getComputedStyle(wrapper).alignItems;
  });
}

test.describe('BPC Sourcing — multi-type price cell alignment', () => {
  test('hugs the right of the dense card’s title line below sm', async ({ page }) => {
    await page.setViewportSize(PHONE);

    await signInAndGoto(page);
    await seedBpcSnapshot(page, [multiTypeContractRow()]);

    await page.goto('./industry/sourcing');

    expect(await priceWrapperAlignItems(page)).toBe('flex-end');
  });

  test('stays right-aligned at and above sm', async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    await signInAndGoto(page);
    await seedBpcSnapshot(page, [multiTypeContractRow()]);

    await page.goto('./industry/sourcing');

    expect(await priceWrapperAlignItems(page)).toBe('flex-end');
  });

  test('a non-multi-type row never renders the wrapper, at any width', async ({ page }) => {
    await page.setViewportSize(PHONE);

    await signInAndGoto(page);
    await seedBpcSnapshot(page, [singleTypeContractRow()]);

    await page.goto('./industry/sourcing');

    const table = page.getByRole('table', { name: 'BPC Sourcing' });
    const priceCell = table.locator('tbody tr').first().locator('td[data-label="Price"]');
    await expect(priceCell).toBeVisible(COLD_LOAD);
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

test.describe('BPC Sourcing — cheapest-per-run chip (issue #1782)', () => {
  test('shows ISK/run beside total price, wrapping like the other summary chips at phone width', async ({
    page,
  }) => {
    // The selected blueprint also triggers a region market-BPO lookup
    // (issue #1241's `bpoSourcesByType`) — irrelevant to this chip, but the
    // shared network guard fails any unmocked ESI request, so it needs an
    // answer, not just a network refusal.
    await page.route(/\/markets\/\d+\/orders/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.setViewportSize(PHONE);

    await signInAndGoto(page);
    await seedBpcSnapshot(page, cheapestPerRunOffers());

    await page.goto(`./industry/sourcing?sourcing.type=${BLUEPRINT_TYPE_ID}`);

    // Total price still headlines the 1-run copy (6M); the per-run chip
    // points at the 10-run copy that's actually cheaper (950K/run) — the two
    // chips must disagree, which is the bug this ticket fixes.
    const cheapestChip = page.getByText('Cheapest', { exact: true }).locator('..');
    const perRunChip = page.getByText('Cheapest per run', { exact: true }).locator('..');
    await expect(cheapestChip).toContainText('6M', COLD_LOAD);
    await expect(perRunChip).toContainText('950K');

    // Same wrapping strip as the existing chips (`StatChip`'s fixed height +
    // `shrink-0` moves the whole chip to its own line rather than squeezing
    // it) — so neither chip should overflow the 390px viewport.
    for (const chip of [cheapestChip, perRunChip]) {
      const box = await chip.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    }
  });
});

test.describe('BPC Sourcing — cheapest by region on a phone', () => {
  test('shows only the pricing baseline, inside the page width', async ({ page }) => {
    await page.route(/\/markets\/\d+\/orders/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.setViewportSize(PHONE);

    // Five regions are listed, but the strip shows the regions a pilot prices
    // at (The Forge, their hub's, the nearest hub's: three at most) — here The
    // Forge alone, with Jita as the hub and no current system. The bug it
    // guards is the strip widening the page past the screen.
    const regions = [
      [THE_FORGE, 'The Forge'],
      [10000043, 'Domain'],
      [10000032, 'Sinq Laison'],
      [10000030, 'Heimatar'],
      [10000042, 'Metropolis'],
    ] as const;
    const base = singleTypeContractRow();
    const offers = regions.map(([regionId], index) => ({
      ...base,
      contractId: 8_000_000 + index,
      regionId,
      price: 1_000_000 * (index + 1),
    }));

    await signInAndGoto(page);
    await seedBpcSnapshot(page, offers, regions);
    await page.goto(`./industry/sourcing?sourcing.type=${BLUEPRINT_TYPE_ID}`);

    const row = page.getByRole('list', { name: 'Cheapest by region' });
    await expect(row).toContainText('The Forge', COLD_LOAD);
    await expect(row).not.toContainText('Metropolis');
    expect(await row.getByRole('listitem').count()).toBeLessThanOrEqual(3);

    const pageWidth = await row.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(PHONE.width);
  });
});
