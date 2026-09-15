/**
 * The Appraisal *share* view's stacked result card at 390px (issue #1113) —
 * the follow-up `marketAppraisalNarrow.spec.ts`'s own ticket (#1097) scoped
 * out so the two pages wouldn't drift mid-ticket. Same defect, same fix
 * (`stackColumns={2}`), different page: `/share/appraisal` hung five short
 * numeric columns off the item name at `DataTable`'s default
 * `stackColumns={1}`, so a shared fifteen-item pile was fifteen six-line
 * cards to scroll — on the page most likely to be opened from a chat client
 * on a phone.
 *
 * Playwright rather than jsdom for the same reason that spec gives: the
 * pairing lives in `.dt-stack-2col`'s `@media (width < 40rem)` grid
 * (`src/styles/index.css`), which jsdom cannot evaluate, so only a real
 * engine can tell a paired card from the six-line one that shipped. Hence
 * assertions on bounding boxes — which cells share a line, how wide each
 * is — rather than on the class token, which
 * `src/routes/AppraisalShared.test.tsx` already guards.
 *
 * Only the five-column case exists here. `appraisalShareData.ts` resolves a
 * link with no `characterId` at all, so the refine-then-sell comparison that
 * gives `AppraisalPanel` an optional sixth column never applies — this
 * page's `columns` array is fixed, and the odd trailing cell the ticket asks
 * to see land cleanly is the only shape to test.
 *
 * No login: this is the app's one unauthenticated content route, which is
 * the whole point of a share link opened by a stranger.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { encodeAppraisalShare } from '../src/engine/market/appraisalShare';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** The share view's `DataTable` label (`appraisalShare.title`) — not the live tab's `Appraisal`. */
const TABLE = 'Shared appraisal';

/** Tritanium and Pyerite: both on the market, neither needing a reprocessing entry (which this page would ignore anyway). */
const TRITANIUM = 34;
const PYERITE = 35;

const PRICES: Record<number, { buy: number; sell: number }> = {
  [TRITANIUM]: { buy: 5.41, sell: 5.68 },
  [PYERITE]: { buy: 11.2, sell: 12.04 },
};

/** Quantities large enough that every total renders as a real multi-character ISK figure rather than a two-digit one that would fit anywhere. */
const ITEMS = [
  { typeId: TRITANIUM, quantity: 3_400_000 },
  { typeId: PYERITE, quantity: 1_750_000 },
];

/**
 * A share link for that pile. Built through the real encoder rather than a
 * hand-written base36 string, so a change to the payload format retargets
 * this spec instead of silently landing it on the invalid-link page.
 */
function shareUrl(): string {
  const encoded = encodeAppraisalShare({
    // Must be a hub `getTradeHub` resolves, or the view renders `invalid`.
    hub: 'jita',
    pricePercent: 100,
    generatedAt: 1_750_000_000,
    items: ITEMS,
  });
  if (!encoded.ok) throw new Error(`share encode failed: ${encoded.reason}`);
  return `./share/appraisal?d=${encodeURIComponent(encoded.payload)}`;
}

/**
 * Answers the aggregates call for whatever types it was asked for, prices as
 * strings because that is how Fuzzwork sends them. Overridden here rather
 * than taken from `support/mockEsi.ts`: the shared `FUZZWORK_AGGREGATES`
 * fixture omits `orderCount`, and `market/fuzzwork.ts`'s `parseSide` reports
 * a side with no order count as *no price*, so against it every figure in
 * this table is an em dash and the pairing assertions would pass on a card
 * holding nothing. A later `page.route` wins over an earlier one — see
 * `support/testBase.ts`.
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

async function openShare(page: Page): Promise<void> {
  await page.goto(shareUrl());
  // Well past the 5s default: opening the link awaits the market type index
  // (~1.5MB of JSON) plus the Fuzzwork round-trip, cold on a CI runner.
  await expect(page.getByRole('table', { name: TABLE })).toBeVisible({ timeout: 15_000 });
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
 * measurement runs in one `evaluate`, so a row that never arrived would
 * otherwise surface as a TypeError instead of a locator timeout naming it.
 */
async function readRow(page: Page, typeId: number): Promise<RowGeometry> {
  const row = page.locator(`table[aria-label="${TABLE}"] tr[data-row-key="${typeId}"]`);
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
    { key: typeId, table: TABLE }
  );
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

test.describe('Shared appraisal — stacked result card', () => {
  test.beforeEach(async ({ page }) => {
    await mockHubPrices(page);
  });

  test('pairs its five value columns and lands the odd trailing cell cleanly at 390px', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openShare(page);

    const { display, contentWidth, cells } = await readRow(page, TRITANIUM);
    expect(display).toBe('grid');

    // Five values under a full-width title: 2+2+1. Asserted as the whole card
    // at once — a per-pair check would pass just as happily on a card that
    // had quietly dropped a column.
    expect(labelLines(cells)).toEqual([
      ['Item'],
      ['Qty', 'Buy each'],
      ['Sell each', 'Buy total'],
      ['Sell total'],
    ]);

    const [[item], ...valueLines] = lines(cells);
    // The name still titles the card across both tracks (`grid-column: 1 / -1`).
    expect(item.width).toBeCloseTo(contentWidth, 0);

    for (const [first, second] of valueLines.slice(0, -1)) {
      // Side by side, each roughly half the card: same width, same line, and
      // the second starting past the end of the first (the 0.75rem gap).
      expect(second.left).toBeGreaterThan(first.left + first.width);
      expect(first.width).toBeCloseTo(second.width, 0);
      expect(first.width).toBeLessThan(contentWidth * 0.55);
      expect(first.width).toBeGreaterThan(contentWidth * 0.4);
    }

    const [firstOfPair] = valueLines[0];
    const [trailing] = valueLines.at(-1)!;
    // The dangling half-row the ticket asks about: it stays in the first
    // track at a paired cell's width, rather than stretching across the card
    // (which would print a label-above-value block at title width) or
    // shifting into the second one.
    expect(trailing.left).toBeCloseTo(firstOfPair.left, 0);
    expect(trailing.width).toBeCloseTo(firstOfPair.width, 0);
    // The other half of "renders cleanly": its label sits above the value in
    // flow, not pinned into the default card's 6.5rem gutter — which inside a
    // ~160px cell would leave the figure nowhere to render.
    expect(trailing.labelPosition).toBe('static');

    // And the halved card still costs the page no sideways scroll, which is
    // the risk a two-track grid runs on a 390px screen.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });

  test('still renders one real table row per item at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openShare(page);

    const { display, contentWidth, rowHeight, cells } = await readRow(page, PYERITE);
    // `stackColumns` may only ever affect the card below `sm` — above it the
    // row is still a table row, all five values plus the name on one line.
    expect(display).toBe('table-row');
    expect(labelLines(cells)).toEqual([
      ['Qty', 'Item', 'Buy each', 'Sell each', 'Buy total', 'Sell total'],
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
