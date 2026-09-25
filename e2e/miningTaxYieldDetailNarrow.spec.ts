/**
 * The Yield Detail modal's "ore mined" table at 390px (issue #1130). Clicking
 * a day on Mining Tax's Overview tab opens that day's per-ore breakdown, whose
 * four numeric columns — units, m³, raw sell value, refined value — hung off
 * the ore name at `DataTable`'s default `stackColumns={1}`, so a normal
 * multi-type op was a scroll of five-line cards to compare raw against
 * refined, which is the modal's entire reason to exist. Fixed the same way
 * `PriceHistoryChart.tsx`'s own day list already is: `stackColumns={2}`.
 *
 * Playwright rather than jsdom because the pairing lives in `.dt-stack-2col`'s
 * `@media (width < 40rem)` grid (`src/styles/index.css`), which jsdom cannot
 * evaluate — only a real engine can tell a paired card from the five-line one
 * that shipped. So the assertions are on bounding boxes, which cells share a
 * line and how wide each is; the class token itself is already guarded by
 * `src/features/miningTax/YieldDetailModal.test.tsx`.
 *
 * Only the two-ore case is seeded. Each row is measured on its own, so the
 * issue's one-ore day is the same card this already asserts twice; and with
 * four non-primary columns the card is always 2+2, so the odd trailing cell
 * the five-column share view had to prove lands cleanly (#1113) cannot occur
 * here at all.
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

interface CellBox {
  label: string;
  text: string;
  top: number;
  left: number;
  width: number;
  /** `::before`'s `position` — `static` is the paired card's label-above-value, `absolute` the default card's pinned 6.5rem gutter. */
  labelPosition: string;
}

interface RowGeometry {
  display: string;
  /** The `tr`'s own content box — what the card's cells have to share. */
  contentWidth: number;
  rowHeight: number;
  cells: CellBox[];
}

/**
 * One ore row's cells, measured. Addressed by `data-row-key` (the typeId)
 * rather than by position: the table's `defaultSort` is by raw value, so
 * position depends on the mocked prices. Waited for first, so a row that never
 * arrived surfaces as a locator timeout naming it rather than a TypeError.
 */
async function readRow(page: Page, typeId: number): Promise<RowGeometry> {
  const row = page.locator(`table[aria-label="${ORE_TABLE}"] tr[data-row-key="${typeId}"]`);
  await expect(row).toBeVisible();
  return page.evaluate(
    ({ key, table: label }) => {
      const table = document.querySelector(`table[aria-label="${label}"]`)!;
      const row = table.querySelector(`tbody tr[data-row-key="${key}"]`) as HTMLElement;
      const style = getComputedStyle(row);
      const box = row.getBoundingClientRect();
      const cells = [...row.querySelectorAll(':scope > td')].map((td) => {
        const cellBox = td.getBoundingClientRect();
        return {
          label: td.getAttribute('data-label') ?? '',
          text: (td.textContent ?? '').trim(),
          top: cellBox.top,
          left: cellBox.left,
          width: cellBox.width,
          labelPosition: getComputedStyle(td, '::before').position,
        };
      });
      return {
        display: style.display,
        contentWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        rowHeight: box.height,
        cells,
      };
    },
    { key: typeId, table: ORE_TABLE }
  );
}

/**
 * Cells clustered into the lines they actually render on, top-to-bottom then
 * left-to-right. A 1px tolerance rather than an exact match: grid stretches the
 * cells of one track row to a shared top, but a tolerance costs nothing and
 * will not split a line on a subpixel.
 */
function lines(cells: CellBox[]): CellBox[][] {
  const grouped: CellBox[][] = [];
  for (const cell of [...cells].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const last = grouped.at(-1);
    if (last && Math.abs(last[0].top - cell.top) <= 1) last.push(cell);
    else grouped.push([cell]);
  }
  return grouped;
}

function labelLines(cells: CellBox[]): string[][] {
  return lines(cells).map((line) => line.map((cell) => cell.label));
}

test.describe('Yield Detail — stacked ore-mined card', () => {
  test.beforeEach(async ({ page }) => {
    await mockMarketHistory(page);
    await signInAndGoto(page);
    await seedMiningDay(page);
  });

  test('pairs its four figures two per row at 390px, on every ore of the day', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openYieldDetail(page);

    for (const { typeId } of ORE_LINES) {
      const { display, contentWidth, cells } = await readRow(page, typeId);
      expect(display).toBe('grid');

      // Four values under a full-width title: 2+2, no odd cell. Asserted as
      // the whole card at once — a per-pair check would pass just as happily
      // on a card that had quietly dropped a column.
      expect(labelLines(cells)).toEqual([
        ['Ore'],
        ['Units', 'm³'],
        ['Raw sell value', 'Refined value'],
      ]);

      // The prices actually landed on the mined date: an em-dash card would
      // satisfy every geometry check below while showing the pilot nothing.
      for (const cell of cells) expect(cell.text).not.toBe('—');

      const [[ore], ...valueLines] = lines(cells);
      // The ore's icon+name still titles the card across both tracks
      // (`grid-column: 1 / -1`).
      expect(ore.width).toBeCloseTo(contentWidth, 0);

      for (const [first, second] of valueLines) {
        // Side by side, each roughly half the card: same width, same line, and
        // the second starting past the end of the first (the 0.75rem gap).
        expect(second.left).toBeGreaterThan(first.left + first.width);
        expect(first.width).toBeCloseTo(second.width, 0);
        expect(first.width).toBeLessThan(contentWidth * 0.55);
        expect(first.width).toBeGreaterThan(contentWidth * 0.4);
        // The other half of "no misaligned label": each label sits above its
        // value in flow, not pinned into the default card's 6.5rem gutter —
        // which inside a ~165px cell would leave the figure nowhere to render.
        // Track geometry alone cannot see this, so without it the whole
        // `td::before` rule could be deleted and this spec stay green.
        for (const cell of [first, second]) expect(cell.labelPosition).toBe('static');
      }
    }

    // And the halved card costs no sideways scroll — measured on the table's
    // own `overflow-x-auto` wrapper (YieldDetailModal.tsx), which would absorb
    // an over-wide card and leave a document-level check none the wiser.
    const wrapper = await page.evaluate((label) => {
      const el = document.querySelector(`table[aria-label="${label}"]`)!.parentElement!;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    }, ORE_TABLE);
    expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth);
  });

  test('still renders one real table row per ore at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openYieldDetail(page);

    const { display, contentWidth, rowHeight, cells } = await readRow(page, VELDSPAR);
    // `stackColumns` may only ever affect the card below `sm` — above it the
    // row is still a table row, all four values plus the ore on one line.
    expect(display).toBe('table-row');
    expect(labelLines(cells)).toEqual([['Ore', 'Units', 'm³', 'Raw sell value', 'Refined value']]);
    // Not just "one line group": a single dense row of text, so a cell that
    // started wrapping onto a second line would fail here rather than pass by
    // sharing a top with its neighbours.
    expect(rowHeight).toBeLessThan(40);
    // And no cell hoisted to title width — that is the stacked card's shape,
    // not this one.
    for (const cell of cells) expect(cell.width).toBeLessThan(contentWidth * 0.9);
  });
});
