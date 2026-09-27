/**
 * Market Browser's order-book Sell/Buy tables at 390px (issue #2095): both
 * `DataTable`s left `stackColumns` at its default `1`, so every non-primary
 * column (Quantity, Location, Security, Jumps, Expires, and Buy's own Range
 * and Min. Volume) got its own line — a sell card ran five lines below the
 * price, a buy card seven, and a normal 12-order book was a multi-thousand-
 * pixel scroll to see four or five orders. Fixed the same way `stackColumns`
 * already is for Appraisal (#1097), Appraisal Share (#1113), Mining Tax
 * Yield Detail (#1130) and PI Plan Sensitivity (#1134): `stackColumns={2}`,
 * pairing the short figures two per line.
 *
 * Playwright rather than jsdom, same reasoning `miningTaxYieldDetailNarrow.spec.ts`
 * gives: the pairing lives in `.dt-stack-2col`'s `@media (width < 40rem)`
 * grid (`src/styles/index.css`), which jsdom cannot evaluate. Assertions are
 * bounding boxes: which cells share a line, and that a long station name and
 * an 8-figure quantity still fit without overlap or sideways scroll.
 *
 * Orders are seeded via a `page.route` override on `GET
 * /markets/{region}/orders`, registered before `signInAndGoto` — the same
 * precedent `openOrdersNarrow.spec.ts` sets for `/characters/{id}/orders`,
 * since a route registered inside the test body wins over the one
 * `installEsiMock` (a `testBase` fixture) already registered. Jita 4-4
 * (60003760) is a real NPC station, resolved from the bundled SDE snapshot
 * (`useMarketCatalogue`) rather than a live ESI call, so its real ~48-
 * character name is the long station name the acceptance criteria asks for
 * with no extra fixture needed. Both orders sit in Jita itself (system_id
 * 30000142), the mocked character's current system
 * (`/characters/{id}/location` in `mockEsi.ts`), so the Jumps column
 * resolves locally off the bundled stargate graph — no `/route/` call.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import type { RegionOrder } from '../src/esi/endpoints';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const REGION = 10000002; // The Forge
const TRITANIUM = 34;
/** Jita IV - Moon 4 - Caldari Navy Assembly Plant — real NPC station, ~48 characters. */
const STATION_A = 60003760;
const JITA_SYSTEM = 30000142;

function order(
  fields: Partial<RegionOrder> & Pick<RegionOrder, 'order_id' | 'is_buy_order'>
): RegionOrder {
  return {
    type_id: TRITANIUM,
    location_id: STATION_A,
    system_id: JITA_SYSTEM,
    price: 5.5,
    volume_remain: 12_345_678,
    volume_total: 12_345_678,
    min_volume: 1,
    issued: new Date().toISOString(),
    duration: 90,
    range: 'station',
    ...fields,
  };
}

const SELL_ORDER = order({ order_id: 1, is_buy_order: false, price: 5.6 });
const BUY_ORDER = order({
  order_id: 2,
  is_buy_order: true,
  price: 5.4,
  range: '5',
  min_volume: 500_000,
});

async function seedOrderBook(page: Page): Promise<void> {
  await page.route(`**/markets/${REGION}/orders*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([SELL_ORDER, BUY_ORDER]),
    })
  );
  // Not in `mockEsi.ts`'s bundled `UNIVERSE_TYPES` fixture (that set is only
  // the implants it needs elsewhere) — `ItemDetailModal`'s dogma lookup for
  // Tritanium falls through to the network guard without this.
  await page.route('https://esi.evetech.net/universe/types/34', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type_id: TRITANIUM,
        name: 'Tritanium',
        description: '',
        group_id: 18,
        published: true,
      }),
    })
  );
}

async function openTritanium(page: Page): Promise<void> {
  await signInAndGoto(page, './market');
  await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
  await page.getByRole('button', { name: 'Tritanium', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Sell Orders' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Buy Orders' })).toBeVisible();
}

interface CellBox {
  label: string;
  text: string;
  top: number;
  left: number;
  width: number;
}

interface RowGeometry {
  display: string;
  contentWidth: number;
  cells: CellBox[];
}

async function readRow(page: Page, tableLabel: string, orderId: number): Promise<RowGeometry> {
  const row = page.locator(`table[aria-label="${tableLabel}"] tr[data-row-key="${orderId}"]`);
  await expect(row).toBeVisible();
  return page.evaluate(
    ({ key, table: label }) => {
      const table = document.querySelector(`table[aria-label="${label}"]`)!;
      const rowEl = table.querySelector(`tbody tr[data-row-key="${key}"]`) as HTMLElement;
      const style = getComputedStyle(rowEl);
      const box = rowEl.getBoundingClientRect();
      // `rowMoreActions`'s button renders as its own unlabelled `td`, pinned
      // absolute to the card's corner (`.dt-actions`) rather than flowing
      // with the labelled fields — excluded here so it can't be mistaken for
      // a field sharing the primary cell's line.
      const cells = [...rowEl.querySelectorAll(':scope > td[data-label]')].map((td) => {
        const cellBox = td.getBoundingClientRect();
        return {
          label: td.getAttribute('data-label') ?? '',
          text: (td.textContent ?? '').trim(),
          top: cellBox.top,
          left: cellBox.left,
          width: cellBox.width,
        };
      });
      return {
        display: style.display,
        contentWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        cells,
      };
    },
    { key: orderId, table: tableLabel }
  );
}

/** Cells clustered into the lines they render on, top-to-bottom then left-to-right; 1px tolerance for grid subpixel rounding. */
function lines(cells: CellBox[]): CellBox[][] {
  const grouped: CellBox[][] = [];
  for (const cell of [...cells].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const last = grouped.at(-1);
    if (last && Math.abs(last[0].top - cell.top) <= 1) last.push(cell);
    else grouped.push([cell]);
  }
  return grouped;
}

test.describe('Market Browser — order book stacked cards', () => {
  test.beforeEach(async ({ page }) => {
    await seedOrderBook(page);
  });

  test('sell and buy cards pair their figures two per line at 390px, with no overlap or scroll', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openTritanium(page);

    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(sell.display).toBe('grid');
    // Price (primary, full width) + Quantity/Location/Security/Jumps/Expires
    // paired two per line, with the fifth (odd) column trailing alone.
    const sellLines = lines(sell.cells);
    expect(sellLines).toHaveLength(4);
    expect(sellLines[0]).toHaveLength(1);
    expect(sellLines[1]).toHaveLength(2);
    expect(sellLines[2]).toHaveLength(2);
    expect(sellLines[3]).toHaveLength(1);

    const buy = await readRow(page, 'Buy Orders', BUY_ORDER.order_id);
    expect(buy.display).toBe('grid');
    // Price + Quantity/Location/Security/Jumps/Expires/Range/Min. Volume: 3
    // paired lines plus a trailing odd one.
    const buyLines = lines(buy.cells);
    expect(buyLines).toHaveLength(5);
    expect(buyLines[0]).toHaveLength(1);
    expect(buyLines[1]).toHaveLength(2);
    expect(buyLines[2]).toHaveLength(2);
    expect(buyLines[3]).toHaveLength(2);
    expect(buyLines[4]).toHaveLength(1);

    // The long station name and the 8-figure quantity both fit their half of
    // the card without pushing past it or overlapping their line partner.
    for (const rowLines of [sellLines, buyLines]) {
      for (const line of rowLines.slice(1)) {
        if (line.length !== 2) continue;
        const [first, second] = line;
        expect(second.left).toBeGreaterThanOrEqual(first.left + first.width);
      }
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('sell and buy tables keep one real row per order at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openTritanium(page);

    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(sell.display).toBe('table-row');
    expect(lines(sell.cells)).toHaveLength(1);

    const buy = await readRow(page, 'Buy Orders', BUY_ORDER.order_id);
    expect(buy.display).toBe('table-row');
    expect(lines(buy.cells)).toHaveLength(1);
  });
});
