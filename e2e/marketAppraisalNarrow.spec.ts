/**
 * Appraisal result card's stacked layout at 390px (issue #1097): the result
 * table hangs five short numeric columns off the item name — six once a row
 * carries reprocessing data and `refineTotal` joins them — at `DataTable`'s
 * default `stackColumns={1}`, so every priced line became a six-line card and
 * a fifteen-item haul a page of them. Fixed by passing `stackColumns={2}`,
 * the two-value-per-row mode `.dt-stack-2col` already ships for exactly this
 * shape (`src/styles/index.css`).
 *
 * The whole point is the reflow, and a reflow is layout: `.dt-stack-2col`'s
 * grid only exists inside a `@media (width < 40rem)` block in a real engine,
 * so jsdom can see the class token and nothing else — it cannot tell a
 * paired card from the six-line one that shipped. Hence Playwright, and hence
 * assertions on bounding boxes (which cells share a row, how wide each is)
 * rather than on the class name, the same reasoning
 * `industryRecordsNarrow.spec.ts` gives for its own stacked-card measurement.
 *
 * Both column counts are reachable here, so both are asserted end to end:
 * Veldspar has a `public/data/reprocessing.json` entry and Tritanium/Pyerite
 * do not, and the fixture pilot is an active Character — which is the whole
 * condition `appraisalData.ts` puts on computing `refine` at all. A paste of
 * Veldspar renders six value columns (2+2+2, no trailing cell); a paste of
 * only minerals renders five (2+2+1, the odd trailing cell the ticket asks
 * to see land cleanly).
 *
 * The Fuzzwork aggregates route is overridden locally rather than in
 * `support/mockEsi.ts`: the shared `FUZZWORK_AGGREGATES` fixture omits
 * `orderCount`, and `market/fuzzwork.ts`'s `parseSide` reports a side with no
 * order count as *no price*, so against the shared mock every figure in this
 * table renders as an em dash. The grid tracks are `minmax(0, 1fr)` and so
 * would still pair up, but a test for "a full-width ISK figure fits in half a
 * card" that prices nothing is not testing much. `mockEsi.ts` names this
 * exact pattern ("a spec that needs real rows should override this route"),
 * and a later `page.route` wins over an earlier one — see `support/testBase.ts`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Veldspar: in `public/data/market/types.json` *and* `reprocessing.json`, so its row carries `refineTotal` and the sixth column appears. */
const VELDSPAR = 1230;
/** Tritanium: on the market, no reprocessing entry of its own — and Veldspar's only output material, so one price fixture serves both cases. */
const TRITANIUM = 34;
/** Pyerite: a second mineral, so the five-column paste still has more than one row. */
const PYERITE = 35;

/** Quantities large enough that every total renders as a real multi-character ISK figure rather than a two-digit one that would fit anywhere. */
const SIX_COLUMN_PASTE = `Veldspar\t1,248,000\nTritanium\t3,400,000`;
const FIVE_COLUMN_PASTE = `Tritanium\t3,400,000\nPyerite\t1,750,000`;

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
  await page.goto('./market?section=appraisal&hub=jita');
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
    const cells = [...row.querySelectorAll(':scope > td')].map((td) => {
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
      contentWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
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

  test('pairs its six value columns two-per-row at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await appraise(page, SIX_COLUMN_PASTE);

    const { display, contentWidth, cells } = await readRow(page, VELDSPAR);
    expect(display).toBe('grid');

    // Six values under a full-width title: 2+2+2, nothing left over. Asserted
    // as the whole card at once — a per-pair check would pass just as happily
    // on a card that had quietly dropped a column.
    expect(labelLines(cells)).toEqual([
      ['Item'],
      ['Qty', 'Buy each'],
      ['Sell each', 'Buy total'],
      ['Sell total', 'Refine total'],
    ]);

    const [[item], ...valueLines] = lines(cells);
    // The name still titles the card across both tracks (`grid-column: 1 / -1`).
    expect(item.width).toBeCloseTo(contentWidth, 0);

    for (const [first, second] of valueLines) {
      // Side by side, each roughly half the card: same width, same line, and
      // the second starting past the end of the first (the 0.75rem gap).
      expect(second.left).toBeGreaterThan(first.left + first.width);
      expect(first.width).toBeCloseTo(second.width, 0);
      expect(first.width).toBeLessThan(contentWidth * 0.55);
      expect(first.width).toBeGreaterThan(contentWidth * 0.4);
    }

    // And the halved card still costs the page no sideways scroll, which is
    // the risk a two-track grid runs on a 390px screen.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });

  test('pairs its five value columns and lands the odd trailing cell cleanly at 390px', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await appraise(page, FIVE_COLUMN_PASTE);

    const { contentWidth, cells } = await readRow(page, TRITANIUM);
    // No row here has reprocessing data, so `AppraisalPanel` never adds the
    // sixth column — five values, an odd count, and a trailing single cell.
    expect(labelLines(cells)).toEqual([
      ['Item'],
      ['Qty', 'Buy each'],
      ['Sell each', 'Buy total'],
      ['Sell total'],
    ]);

    const valueLines = lines(cells).slice(1);
    const [firstOfPair] = valueLines[0];
    const [trailing] = valueLines.at(-1)!;
    // The dangling half-row the ticket asks about: it stays in the first
    // track at a paired cell's width, rather than stretching across the card
    // (which would print a label-above-value block at title width) or
    // shifting into the second one.
    expect(trailing.left).toBeCloseTo(firstOfPair.left, 0);
    expect(trailing.width).toBeCloseTo(firstOfPair.width, 0);
    expect(trailing.width).toBeLessThan(contentWidth * 0.55);
    // The other half of "renders cleanly": its label sits above the value in
    // flow, not pinned into the default card's 6.5rem gutter — which inside a
    // ~160px cell would leave the figure nowhere to render.
    expect(trailing.labelPosition).toBe('static');
  });

  test('still renders one real table row per item at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await appraise(page, SIX_COLUMN_PASTE);

    const { display, contentWidth, rowHeight, cells } = await readRow(page, VELDSPAR);
    // `stackColumns` may only ever affect the card below `sm` — above it the
    // row is still a table row, all six values plus the name on one line.
    expect(display).toBe('table-row');
    expect(labelLines(cells)).toEqual([
      ['Qty', 'Item', 'Buy each', 'Sell each', 'Buy total', 'Sell total', 'Refine total'],
    ]);
    // Not just "one line group": a single dense row of text, so a cell that
    // started wrapping onto a second line would fail here rather than pass by
    // sharing a top with its neighbours.
    expect(rowHeight).toBeLessThan(40);
    // And no cell hoisted to title width — that is the stacked card's shape,
    // not this one.
    for (const cell of cells) expect(cell.width).toBeLessThan(contentWidth * 0.9);
  });
});
