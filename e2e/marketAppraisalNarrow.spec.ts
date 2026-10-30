/**
 * Appraisal result table at phone and desktop widths. A phone keeps a real
 * table (Item, Buy total, Sell total; the Columns menu swaps others in) whose
 * headers sort, instead of the stacked cards it used to collapse into. The
 * Fuzzwork aggregates route is overridden locally because the shared fixture
 * omits `orderCount`, which `market/fuzzwork.ts` reads as "no price" — a spec
 * that needs real figures overrides it (see `support/testBase.ts`).
 */
import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';

/** Veldspar: in `public/data/market/types.json` *and* `reprocessing.json`, so its row carries `refineTotal` and the sixth column appears. */
const VELDSPAR = 1230;
/** Tritanium: on the market, no reprocessing entry of its own — and Veldspar's only output material, so one price fixture serves both cases. */
const TRITANIUM = 34;
/** Pyerite: a second mineral, so the no-refine paste still has more than one row. */
const PYERITE = 35;

/** Quantities large enough that every total renders as a real multi-character ISK figure rather than a two-digit one that would fit anywhere. */
const SIX_COLUMN_PASTE = `Veldspar\t1,248,000\nTritanium\t3,400,000`;

const PRICES: Record<number, { buy: number; sell: number }> = {
  [TRITANIUM]: { buy: 5.41, sell: 5.68 },
  [PYERITE]: { buy: 11.2, sell: 12.04 },
  [VELDSPAR]: { buy: 18.9, sell: 21.5 },
};

/**
 * Answers the aggregates call for whatever types it was asked for, prices as
 * strings because that is how Fuzzwork sends them. A type with no fixture
 * price comes back at zero orders — Fuzzwork's own way of saying nobody is
 * trading it, and a dash in the table.
 */
async function mockHubPrices(page: Page): Promise<void> {
  // The page prices from the live Jita book first (#5591), Fuzzwork only as a
  // per-row fallback: serve the same fixture prices as one order each side.
  await page.route(/^https:\/\/esi\.evetech\.net\/(?:[^/]+\/)?markets\/\d+\/orders/, (route) => {
    const price = PRICES[Number(new URL(route.request().url()).searchParams.get('type_id'))];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        price
          ? [
              { order_id: 1, is_buy_order: false, location_id: 60_003_760, price: price.sell },
              { order_id: 2, is_buy_order: true, location_id: 60_003_760, price: price.buy },
            ]
          : []
      ),
    });
  });
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body = Object.fromEntries(
      types.split(',').map((raw) => {
        const price = PRICES[Number(raw)];
        const orderCount = price ? '40' : '0';
        return [
          raw,
          {
            buy: { max: String(price?.buy ?? 0), volume: '900000000', orderCount },
            sell: { min: String(price?.sell ?? 0), volume: '900000000', orderCount },
          },
        ];
      })
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** Pastes a haul into the Appraisal tab and prices it. `hub` is pinned rather than left to `DEFAULT_TRADE_HUB`, so a change to which hub ships as the default cannot quietly re-point this. */
async function appraise(page: Page, paste: string): Promise<void> {
  await page.goto('./market/appraisal?hub=jita');
  await page.getByLabel(/items from inventory/i).fill(paste);
  await page.getByRole('button', { name: 'Appraise', exact: true }).click();
  // Well past the 5s default: one click here awaits the market type index and
  // the reprocessing table (~1.5MB of JSON each, and no other spec pays for
  // the second) plus six Fuzzwork round-trips, all cold on a CI runner.
  await expect(page.getByRole('table', { name: 'Appraisal' })).toBeVisible({ timeout: 15_000 });
}

interface CellBox {
  label: string;
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
 * One row's cells, measured. Addressed by `data-row-key` (`DataTable`'s
 * `rowKey`, the typeId here) rather than by position, so a sort order change
 * can't silently point this at a different item. Waited for first: the
 * measurement below runs in one `evaluate`, so a row that never arrived would
 * otherwise surface as a TypeError instead of a locator timeout naming it.
 */
async function readRow(page: Page, typeId: number): Promise<RowGeometry> {
  const row = page.locator(`table[aria-label="Appraisal"] tr[data-row-key="${typeId}"]`);
  await expect(row).toBeVisible();
  return page.evaluate((key) => {
    const table = document.querySelector('table[aria-label="Appraisal"]')!;
    const row = table.querySelector(`tbody tr[data-row-key="${key}"]`) as HTMLElement;
    const style = getComputedStyle(row);
    const box = row.getBoundingClientRect();
    // The More actions cell is a control, not a field — no label, no value.
    const cells = [...row.querySelectorAll(':scope > td:not(.dt-actions)')].map((td) => {
      const cellBox = td.getBoundingClientRect();
      return {
        label: td.getAttribute('data-label') ?? '',
        top: cellBox.top,
        left: cellBox.left,
        width: cellBox.width,
        labelPosition: getComputedStyle(td, '::before').position,
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
      rowHeight: box.height,
      cells,
    };
  }, typeId);
}

/**
 * Cells clustered into the lines they actually render on, top-to-bottom then
 * left-to-right. A 1px tolerance rather than an exact match: grid stretches
 * the cells of one track row to a shared top, but a tolerance costs nothing
 * and will not split a line on a subpixel.
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

test.describe('Market Appraisal — stacked result card', () => {
  test.beforeEach(async ({ page }) => {
    await mockHubPrices(page);
    await signInAndGoto(page);
  });

  test('keeps a real table at 390px: Item, Buy and Sell, sorted from their headers', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await appraise(page, SIX_COLUMN_PASTE);

    // A table, not stacked cards: the row stays a table row.
    const { display, cells } = await readRow(page, VELDSPAR);
    expect(display).toBe('table-row');
    // The Qty cell is dropped below `sm`: the count sits under the name instead.
    const shown = cells.filter((cell) => cell.width > 0).map((cell) => cell.label);
    expect(shown).toEqual(['Item', 'Buy total', 'Sell total']);
    await expectNoPageOverflow(page);

    const rowKeys = () =>
      page
        .locator('table[aria-label="Appraisal"] tbody tr[data-row-key]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key')));
    // Paste order until a header is clicked.
    expect(await rowKeys()).toEqual([String(VELDSPAR), String(TRITANIUM)]);

    const header = (name: RegExp) => page.getByRole('columnheader', { name }).getByRole('button');
    // Sell total: Veldspar 26.8M against Tritanium 19.3M.
    // Numbers start high to low, so the first click leads with the bigger total.
    await header(/Sell total/).click();
    await expect.poll(rowKeys).toEqual([String(VELDSPAR), String(TRITANIUM)]);
    await header(/Sell total/).click();
    await expect.poll(rowKeys).toEqual([String(TRITANIUM), String(VELDSPAR)]);
    // Item sorts by name too.
    await header(/Item/).click();
    await expect.poll(rowKeys).toEqual([String(TRITANIUM), String(VELDSPAR)]);
    // And so does Buy total.
    await header(/Buy total/).click();
    await expect.poll(rowKeys).toEqual([String(VELDSPAR), String(TRITANIUM)]);
  });

  test('still renders one real table row per item at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await appraise(page, SIX_COLUMN_PASTE);

    const { display, contentWidth, rowHeight, cells } = await readRow(page, VELDSPAR);
    // `stackColumns` may only ever affect the card below `sm` — above it the
    // row is still a table row, all seven values plus the name on one line.
    expect(display).toBe('table-row');
    expect(labelLines(cells)).toEqual([
      [
        'Item',
        'Qty',
        'Buy each',
        'Sell each',
        'Buy total',
        'Sell total',
        'Refine total',
        'Volume (m³)',
      ],
    ]);
    // Not just "one line group": a single dense row of text, so a cell that
    // started wrapping onto a second line would fail here rather than pass by
    // sharing a top with its neighbours.
    expect(rowHeight).toBeLessThan(40);
    // And no cell hoisted to title width — that is the stacked card's shape,
    // not this one.
    for (const cell of cells) expect(cell.width).toBeLessThan(contentWidth * 0.9);
  });

  test('keeps the Buy, Split and Sell boxes in one row and inside the page at 1280px (#2949)', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await appraise(page, SIX_COLUMN_PASTE);

    const boxes = await page
      .locator('section[aria-label="Buy"], section[aria-label="Split"], section[aria-label="Sell"]')
      .evaluateAll((sections) =>
        sections.map((section) => {
          const r = section.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        })
      );
    expect(boxes).toHaveLength(3);
    // Side by side, not reflowed.
    for (const b of boxes) expect(b.top).toBeCloseTo(boxes[0].top, 0);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        expect(a.right <= b.left + 1 || b.right <= a.left + 1).toBe(true);
      }
    }
    await expectNoPageOverflow(page);
  });

  test('folds the paste form so the first result group is on screen at 390px (#3135)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await appraise(page, SIX_COLUMN_PASTE);

    await expect(page.getByLabel(/items from inventory/i)).toHaveCount(0);
    const summary = page.getByRole('button', { name: /Edit list/ });
    await expect(summary).toHaveAttribute('aria-expanded', 'false');

    const group = page.locator('section[aria-label="Buy"]');
    await expect(group).toBeVisible();
    const box = (await group.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(PHONE.height);
    await expectNoPageOverflow(page);

    await summary.click();
    await expect(page.getByLabel(/items from inventory/i)).toHaveValue(SIX_COLUMN_PASTE);
  });

  test('keeps the paste form open beside the result at 1280px (#3135)', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await appraise(page, SIX_COLUMN_PASTE);
    await expect(page.getByLabel(/items from inventory/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit list/ })).toHaveCount(0);
  });

  test('has no phone sort bar at 640px or 1280px', async ({ page }) => {
    for (const width of [640, DESKTOP.width]) {
      await page.setViewportSize({ width, height: DESKTOP.height });
      await appraise(page, SIX_COLUMN_PASTE);
      await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
      await expect(
        page.getByRole('columnheader', { name: /Sell total/ }).getByRole('button')
      ).toBeVisible();
    }
  });

  // #3114: the paste box follows its content, so a short list does not leave a
  // mostly empty box pushing the result down. Compared in-test, no pixel values.
  for (const size of [
    { name: '390px', viewport: PHONE },
    { name: '1024px', viewport: { width: 1024, height: 800 } },
    { name: '1280px', viewport: DESKTOP },
  ]) {
    test(`sizes the paste box to its content at ${size.name}`, async ({ page }) => {
      await page.setViewportSize(size.viewport);
      const paste = (n: number) =>
        Array.from({ length: n }, (_, i) => (i % 2 ? 'Pyerite\t100' : 'Tritanium\t100')).join('\n');
      const measure = async (lineCount: number) => {
        await appraise(page, paste(lineCount));
        // Below lg the form folds away once a result exists (#3135); open it to measure the box.
        if (size.viewport.width < 1024)
          await page.getByRole('button', { name: /Edit list/ }).click();
        const box = await page.getByLabel(/items from inventory/i).boundingBox();
        const table = await page.getByRole('table', { name: 'Appraisal' }).boundingBox();
        return {
          textareaHeight: box!.height,
          resultTop: table!.y + (await page.evaluate(() => window.scrollY)),
        };
      };
      const short = await measure(3);
      await expectNoPageOverflow(page);
      const long = await measure(14);
      await expectNoPageOverflow(page);

      expect(short.textareaHeight).toBeLessThan(long.textareaHeight);
      if (size.viewport.width < 1024) expect(short.resultTop).toBeLessThan(long.resultTop);
    });
  }
});

test.describe('Market Appraisal — result header controls (#3112)', () => {
  test.beforeEach(async ({ page }) => {
    await mockHubPrices(page);
    await signInAndGoto(page);
  });

  for (const width of [390, 1024, 1280]) {
    test(`has no header buttons until appraised, then fits its controls at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('./market/appraisal?hub=jita');
      const header = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Appraisal', exact: true }) })
        .locator('header')
        .last();
      await expect(page.getByText('Nothing appraised yet')).toBeVisible();
      await expect(header.getByRole('button')).toHaveCount(0);

      await appraise(page, SIX_COLUMN_PASTE);
      await expect(header.getByRole('button', { name: 'Columns' })).toBeVisible();
      await expect(header.getByRole('button', { name: 'Copy Share Link' })).toBeVisible();

      // Invariants, not pixels: the title stays on one line and the header
      // does not spill sideways.
      const fit = await header.evaluate((el) => {
        const h2 = el.querySelector('h2')!;
        return {
          overflows: el.scrollWidth > el.clientWidth + 1,
          titleWraps:
            h2.getBoundingClientRect().height > parseFloat(getComputedStyle(h2).lineHeight) * 1.5,
        };
      });
      expect(fit.overflows).toBe(false);
      expect(fit.titleWraps).toBe(false);
      await expectNoPageOverflow(page);
    });
  }
});
