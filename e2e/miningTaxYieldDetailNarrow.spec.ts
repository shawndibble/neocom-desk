/**
 * The Yield Detail modal's "ore mined" table at 390px. Clicking a day on
 * Mining Tax's Overview tab opens that day's per-ore breakdown, whose numeric
 * columns exist to compare raw against refined value across a row. It stays a
 * plain table (`responsive="table"`) below `sm` rather than collapsing to
 * cards: the ore column is pinned (`stickyStart`), the low-value m³ column
 * drops out (`phoneHidden`), and the table scrolls sideways in its own
 * wrapper if it still does not fit.
 *
 * Playwright rather than jsdom because the layout is stylesheet-driven, which
 * jsdom cannot evaluate.
 *
 * The day is seeded straight into IndexedDB (a cached raw ESI mining-ledger
 * row plus the solar system's name/security) on the same raw-`indexedDB`
 * precedent `miningTaxNarrow.spec.ts` uses, run only after
 * `loginAndSelectCharacter` so the app's Dexie schema has already opened the
 * stores, and with a fresh `fetchedAt` so `esi/cache.ts` serves them without a
 * live call.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Veldspar and Zeolites: both in `public/data/oreAndIceTypeIds.json`, both with a `reprocessing.json` entry, so each line gets a real refined value rather than an em dash. */
const VELDSPAR = 1230;
const ZEOLITES = 45490;
/** Jita — a real solar system id, pre-seeded below so `loadSystemNameAndSecurity` never fetches it live. */
const SOLAR_SYSTEM_ID = 30000142;
const ENTRY_DATE = '2026-09-08';
/** `esi/cache.ts`'s character-independent public-lookup sentinel (`GLOBAL_CACHE_CHARACTER_ID`). */
const GLOBAL_CACHE_CHARACTER_ID = 0;

/** Both quantities clear each ore's 100-unit `reprocessing.json` `portionSize`, so every line has a real refined value and the em-dash guard below has something to guard. */
const ORE_LINES = [
  { typeId: VELDSPAR, quantity: 1_300_000 },
  { typeId: ZEOLITES, quantity: 4_200 },
];

const ORE_TABLE = 'Ore mined';
const OVERVIEW_TABLE = 'Overview';

/**
 * Answers `/markets/{region}/history` for any type it is asked about, with a
 * point on the mined date itself. That date is the whole point: `yieldSnapshot`
 * keys `priceByTypeAndDate` by typeId *and* date, so history that misses
 * `ENTRY_DATE` prices every line at nothing and the layout assertions below
 * would pass happily on a card of em dashes. A glob rather than a computed
 * URL because the ids requested include each ore's Compressed counterpart and
 * every material it refines into, and the region comes from
 * `DEFAULT_TRADE_HUB` — none of which this spec should have to re-derive.
 * A later `page.route` wins over an earlier one — see `support/testBase.ts`.
 */
async function mockMarketHistory(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/markets/*/history*', async (route) => {
    const body = ['2026-09-06', '2026-09-07', ENTRY_DATE].map((date) => ({
      date,
      average: 4200.5,
      highest: 4400,
      lowest: 4000,
      volume: 900_000_000,
      order_count: 40,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function seedMiningDay(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, globalCacheCharacterId, solarSystemId, entryDate, oreLines }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['esiCache'], 'readwrite');
        // Raw ESI mining-ledger rows (`getCharacterMining`'s shape), grouped by
        // `groupMiningLedger` into one Mining Ledger Entry for this (date,
        // system) pair — two ore types on the one day.
        tx.objectStore('esiCache').put({
          characterId,
          key: 'miningTax:ledger',
          value: oreLines.map((line) => ({
            date: entryDate,
            quantity: line.quantity,
            solar_system_id: solarSystemId,
            type_id: line.typeId,
          })),
          fetchedAt: now,
          truncated: false,
        });
        tx.objectStore('esiCache').put({
          characterId: globalCacheCharacterId,
          key: `system:${solarSystemId}`,
          value: { system_id: solarSystemId, name: 'Jita', security_status: 0.9 },
          fetchedAt: now,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    {
      characterId: CHARACTER_ID,
      globalCacheCharacterId: GLOBAL_CACHE_CHARACTER_ID,
      solarSystemId: SOLAR_SYSTEM_ID,
      entryDate: ENTRY_DATE,
      oreLines: ORE_LINES,
    }
  );
}

/** Opens Mining's Overview tab and clicks the seeded day. */
async function openYieldDetail(page: Page): Promise<void> {
  await page.goto('./mining/overview');

  const day = page.locator(
    `table[aria-label="${OVERVIEW_TABLE}"] ` +
      `tr[data-row-key="${CHARACTER_ID}:${ENTRY_DATE}:${SOLAR_SYSTEM_ID}"]`
  );
  // Well past the 5s default: the Overview tab awaits the SDE bake plus a
  // market-history round-trip per priced type, cold on a CI runner.
  await expect(day).toBeVisible({ timeout: 20_000 });
  await day.click();
  await expect(page.getByRole('table', { name: ORE_TABLE })).toBeVisible();
}

/** Header labels currently visible in the ore table's header row. */
async function visibleHeaders(page: Page): Promise<string[]> {
  return page.evaluate((label) => {
    const table = document.querySelector(`table[aria-label="${label}"]`)!;
    return [...table.querySelectorAll('thead th')]
      .filter((th) => getComputedStyle(th).display !== 'none')
      .map((th) => (th.textContent ?? '').trim());
  }, ORE_TABLE);
}

test.describe('Yield Detail — ore-mined table', () => {
  test.beforeEach(async ({ page }) => {
    await mockMarketHistory(page);
    await signInAndGoto(page);
    await seedMiningDay(page);
  });

  test('stays a plain table at 390px, m³ dropped, every ore priced', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openYieldDetail(page);

    for (const { typeId } of ORE_LINES) {
      const row = page.locator(
        `table[aria-label="${ORE_TABLE}"] tbody tr[data-row-key="${typeId}"]`
      );
      await expect(row).toBeVisible();
      expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe('table-row');
      // The prices actually landed on the mined date: an em-dash row would
      // satisfy every layout check while showing the pilot nothing.
      for (const cell of await row.locator('td').all()) {
        if (await cell.isVisible()) await expect(cell).not.toHaveText('—');
      }
    }

    const headers = await visibleHeaders(page);
    expect(headers).toContain('Raw sell value');
    expect(headers).toContain('Refined value');
    expect(headers).not.toContain('m³');
    // The table scrolls inside its own wrapper, never the page.
    await expectNoPageOverflow(page);
  });

  test('shows every column in one table row at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openYieldDetail(page);

    const row = page.locator(
      `table[aria-label="${ORE_TABLE}"] tbody tr[data-row-key="${VELDSPAR}"]`
    );
    expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe('table-row');
    expect(await visibleHeaders(page)).toEqual([
      'Ore',
      'Units',
      'm³',
      'Raw sell value',
      'Refined value',
    ]);
  });
});
