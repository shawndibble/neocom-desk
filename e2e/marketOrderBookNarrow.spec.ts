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
 * The order book rework (2026-10-04) went further: an order is now the dense
 * two-line card — station and price, then quantity, distance, security and
 * expiry — and a phone shows one side at a time behind a Sell | Buy toggle.
 * The card is picked by the order book's own width, not the viewport, so a
 * desktop whose finder column leaves the book narrow (1280px) gets it too.
 *
 * Playwright rather than jsdom, same reasoning `miningTaxYieldDetailNarrow.spec.ts`
 * gives: the card lives in `.dt-stack-dense` (`.dt-stacked`,
 * `src/styles/index.css`), which jsdom cannot evaluate. Assertions are
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
/** Real NPC station, bundled in `public/data/market/stations.json` — its ~46-character name is the long station name the acceptance criteria asks for. */
const STATION_A = 60003760;
const STATION_A_NAME = 'Jita 4 - Moon 4 - Caldari Navy Assembly Plant';
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
  // Only Sell: a phone shows one side at a time, behind the Sell | Buy toggle.
  await expect(page.getByRole('table', { name: 'Sell Orders' })).toBeVisible();
}

interface CellBox {
  label: string;
  text: string;
  top: number;
  left: number;
  width: number;
  /** A wrapped-but-clipped cell would still pass every geometry check above — its box never grows past its track, it just hides content inside it. This is what actually catches that. */
  clipped: boolean;
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
      // Cells a width or a card leaves out (`display: none`) have no box.
      const shown = [...rowEl.querySelectorAll(':scope > td[data-label]')].filter(
        (td) => td.getBoundingClientRect().width > 0
      );
      const cells = shown.map((td) => {
        const cellBox = td.getBoundingClientRect();
        return {
          label: td.getAttribute('data-label') ?? '',
          text: (td.textContent ?? '').trim(),
          top: cellBox.top,
          left: cellBox.left,
          width: cellBox.width,
          clipped: td.scrollWidth > td.clientWidth + 1,
        };
      });
      return {
        display: style.display,
        contentWidth:
          box.width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight) -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth),
        cells,
      };
    },
    { key: orderId, table: tableLabel }
  );
}

/**
 * Cells clustered into the lines they render on, top-to-bottom then
 * left-to-right; 1px tolerance for grid subpixel rounding by default. The
 * dense card aligns its first line on the text baseline, so its bigger price
 * figure sits a few px below the station name on the same line.
 */
function lines(cells: CellBox[], tolerance = 1): CellBox[][] {
  const grouped: CellBox[][] = [];
  for (const cell of [...cells].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const last = grouped.at(-1);
    if (last && Math.abs(last[0].top - cell.top) <= tolerance) last.push(cell);
    else grouped.push([cell]);
  }
  return grouped.map((line) => line.sort((a, b) => a.left - b.left));
}

function labelLines(cells: CellBox[], tolerance = 1): string[][] {
  return lines(cells, tolerance).map((line) => line.map((cell) => cell.label));
}

/** A phone card: the pinned ⋮ is a 44px target centred on the card, with no › beside or under it, clear of line two. */
async function expectCardMenu(page: Page, tableLabel: string, orderId: number) {
  const row = page.locator(`table[aria-label="${tableLabel}"] tr[data-row-key="${orderId}"]`);
  const more = await row.getByRole('button', { name: /^More actions/ }).boundingBox();
  const card = await row.boundingBox();
  const meta = await row.locator('td.dt-meta').last().boundingBox();
  expect(more!.width).toBeGreaterThanOrEqual(44);
  expect(more!.height).toBeGreaterThanOrEqual(44);
  await expect(row.locator('td.dt-disclosure svg')).toBeHidden();
  const dy = Math.abs(more!.y + more!.height / 2 - (card!.y + card!.height / 2));
  expect(dy, `⋮ centre-y vs card centre-y (${tableLabel})`).toBeLessThanOrEqual(1);
  // Headroom, so a font a little wider than ours can't run text under the button.
  const gap = more!.x - (meta!.x + meta!.width);
  expect(gap, `line two to ⋮ (${tableLabel})`).toBeGreaterThanOrEqual(8);
}

test.describe('Market Browser — order book stacked cards', () => {
  test.beforeEach(async ({ page }) => {
    await seedOrderBook(page);
  });

  /** The two-line order card: station and price, then quantity, distance, security and expiry (and a buy's range). */
  async function expectTwoLineCards(page: Page) {
    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(sell.display).toBe('flex');
    expect(labelLines(sell.cells, 8)).toEqual([
      ['Location', 'Price'],
      ['Qty', 'Jumps', 'Sec', 'Expires'],
    ]);
    // The real station, not the "Unknown Structure" fallback — truncated on
    // the card's title line, in full in the DOM (and the expanded row).
    expect(sell.cells.find((c) => c.label === 'Location')!.text).toBe(STATION_A_NAME);
    for (const cell of sell.cells.filter((c) => c.label !== 'Location')) {
      expect(cell.clipped, cell.label).toBe(false);
    }
    const rowHeight = await page
      .locator(`table[aria-label="Sell Orders"] tr[data-row-key="${SELL_ORDER.order_id}"]`)
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(rowHeight).toBeLessThanOrEqual(64);
  }

  test('a phone reads each order as a two-line card, one side at a time', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openTritanium(page);

    await expectTwoLineCards(page);
    await expectCardMenu(page, 'Sell Orders', SELL_ORDER.order_id);
    await expect(page.getByRole('table', { name: 'Buy Orders' })).toBeHidden();

    await page.getByRole('button', { name: /^Buy · 1/ }).click();
    await expect(page.getByRole('table', { name: 'Sell Orders' })).toBeHidden();
    const buy = await readRow(page, 'Buy Orders', BUY_ORDER.order_id);
    expect(labelLines(buy.cells, 8)).toEqual([
      ['Location', 'Price'],
      ['Qty', 'Jumps', 'Sec', 'Expires', 'Range'],
    ]);
    await expectCardMenu(page, 'Buy Orders', BUY_ORDER.order_id);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a desktop whose order book column is too narrow for its columns uses the same cards (1280px)', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await openTritanium(page);
    await expectTwoLineCards(page);
    // Both sides at once off a phone — the toggle is phone-only.
    await expect(page.getByRole('table', { name: 'Buy Orders' })).toBeVisible();
  });

  test('the column picker on a card chooses what the card carries (390px)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openTritanium(page);
    await page
      .getByRole('region', { name: 'Sell Orders' })
      .getByRole('button', { name: 'Columns' })
      .click();
    await page.getByRole('menuitemcheckbox', { name: 'Sec' }).click();
    await page.keyboard.press('Escape');

    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(sell.display).toBe('flex');
    expect(labelLines(sell.cells, 8)).toEqual([
      ['Location', 'Price'],
      ['Qty', 'Jumps', 'Expires'],
    ]);
  });

  test('unticking a column brings the table back where the cards had taken over (1280px)', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await openTritanium(page);
    expect((await readRow(page, 'Sell Orders', SELL_ORDER.order_id)).display).toBe('flex');

    // Fewer columns need less width (`orderBookWidthsRem`): this book fits them as a table.
    // Two, not one: the budget counts the ⋮ column, so Sec alone no longer
    // clears the 8-figure quantity at this width.
    await page
      .getByRole('region', { name: 'Sell Orders' })
      .getByRole('button', { name: 'Columns' })
      .click();
    await page.getByRole('menuitemcheckbox', { name: 'Sec' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Jumps' }).click();
    await page.keyboard.press('Escape');
    const table = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(table.display).toBe('table-row');
    expect(lines(table.cells)).toHaveLength(1);
  });

  test('with Location unticked, Price titles the card rather than doubling as its corner (390px)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openTritanium(page);
    await page
      .getByRole('region', { name: 'Sell Orders' })
      .getByRole('button', { name: 'Columns' })
      .click();
    await page.getByRole('menuitemcheckbox', { name: 'Location' }).click();
    await page.keyboard.press('Escape');

    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(labelLines(sell.cells, 8)).toEqual([['Price'], ['Qty', 'Jumps', 'Sec', 'Expires']]);
    const priceCell = page.locator(
      `table[aria-label="Sell Orders"] tr[data-row-key="${SELL_ORDER.order_id}"] td.dt-primary`
    );
    await expect(priceCell).not.toHaveClass(/dt-corner/);
  });

  test('Min. Volume, once ticked, rides on the buy card (390px)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openTritanium(page);
    await page.getByRole('button', { name: /^Buy · 1/ }).click();
    const buySide = page.getByRole('region', { name: 'Buy Orders' });
    await buySide.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Min. Volume' }).click();
    await page.keyboard.press('Escape');

    const buy = await readRow(page, 'Buy Orders', BUY_ORDER.order_id);
    expect(buy.cells.find((c) => c.label === 'Min. Volume')?.text).toContain('500,000');
    for (const cell of buy.cells.filter((c) => c.label !== 'Location')) {
      expect(cell.clipped, cell.label).toBe(false);
    }
  });

  test('a wide desktop keeps one real row per order (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTritanium(page);

    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(sell.display).toBe('table-row');
    expect(lines(sell.cells)).toHaveLength(1);

    const buy = await readRow(page, 'Buy Orders', BUY_ORDER.order_id);
    expect(buy.display).toBe('table-row');
    expect(lines(buy.cells)).toHaveLength(1);
  });
});
