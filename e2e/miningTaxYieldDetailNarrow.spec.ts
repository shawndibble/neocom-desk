import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const VELDSPAR = 1230;
const ZEOLITES = 45490;
const SOLAR_SYSTEM_ID = 30000142;
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
const ENTRY_DATE = daysAgo(3);
const GLOBAL_CACHE_CHARACTER_ID = 0;

const ORE_LINES = [
  { typeId: VELDSPAR, quantity: 1_300_000 },
  { typeId: ZEOLITES, quantity: 4_200 },
];

const ORE_TABLE = 'Ore mined';
const OVERVIEW_TABLE = 'Overview';

const JITA_STATION_ID = 60003760;

async function mockOpenPrices(page: Page): Promise<void> {
  await page.route('https://data.neocomdesk.com/open-prices/shards/*.json', (route) =>
    route.fulfill({ status: 404, body: '' })
  );
  await page.route('https://data.neocomdesk.com/open-prices/*.json', async (route) => {
    const dates = [daysAgo(5), daysAgo(4), ENTRY_DATE];
    const body = {
      dates,
      stations: {
        [JITA_STATION_ID]: { buy: dates.map(() => 4000), sell: dates.map(() => 4400) },
      },
    };
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

async function openYieldDetail(page: Page): Promise<void> {
  await page.goto('./mining/overview');

  const day = page.locator(
    `table[aria-label="${OVERVIEW_TABLE}"] ` +
      `tr[data-row-key="${CHARACTER_ID}:${ENTRY_DATE}:${SOLAR_SYSTEM_ID}"]`
  );
  await expect(day).toBeVisible({ timeout: 20_000 });
  await day.click();
  await expect(page.getByRole('table', { name: ORE_TABLE })).toBeVisible();
}

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
    await mockOpenPrices(page);
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
      for (const cell of await row.locator('td').all()) {
        if (await cell.isVisible()) await expect(cell).not.toHaveText('—');
      }
    }

    for (const { typeId } of ORE_LINES) {
      const name = page
        .locator(`table[aria-label="${ORE_TABLE}"] tbody tr[data-row-key="${typeId}"] td`)
        .first()
        .locator('a')
        .first();
      const fits = await name.evaluate((el) => {
        const span = el.parentElement!;
        return span.scrollWidth <= span.clientWidth;
      });
      expect(fits).toBe(true);
    }

    const headers = await visibleHeaders(page);
    expect(headers).toContain('Raw sell value');
    expect(headers).toContain('Refined value');
    expect(headers).not.toContain('m³');
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
