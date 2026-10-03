/**
 * The **Shared Appraisal** page's stacked result card at 390px (issue #1113) —
 * the follow-up `marketAppraisalNarrow.spec.ts`'s own ticket (#1097) scoped
 * out so the two pages wouldn't drift mid-ticket. Same defect, same fix
 * (`stackColumns={2}`), different page: the share view hung five short
 * numeric columns off the item name at `DataTable`'s default
 * `stackColumns={1}`, so a shared fifteen-item pile was fifteen six-line
 * cards to scroll — on the page most likely to be opened from a chat client
 * on a phone.
 *
 * Playwright rather than jsdom for the same reason that spec gives: the
 * pairing lives in `.dt-stack-2col`'s phone grid (`.dt-stacked`,
 * `src/styles/index.css`), which jsdom cannot evaluate, so only a real
 * engine can tell a paired card from the six-line one that shipped. Hence
 * assertions on bounding boxes — which cells share a line, how wide each
 * is — rather than on the class token, which `src/routes/SharedLink.test.tsx`
 * already guards.
 *
 * Only one column count exists here. A Shared Appraisal carries no
 * refine-then-sell comparison, so the optional extra column `AppraisalPanel`
 * can grow never applies — this page's `columns` array is fixed. Since the
 * Volume column joined (issue #2337) that is six values, 2+2+2, so the odd
 * trailing cell #1113 asked about no longer arises here;
 * `marketAppraisalNarrow.spec.ts` still covers that shape on the live tab.
 *
 * No login: a Share Link opens for anyone, which is the whole point of one
 * sent to a stranger. The share itself is served by mocking Firestore's
 * document read — the e2e build carries a placeholder project id for exactly
 * this (`playwright.config.ts`'s `E2E_ENV`), and no API key, so sync stays off.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** The share view's `DataTable` label (`appraisalShare.title`) — not the live tab's `Appraisal`. */
const TABLE = 'Shared appraisal';

const SHARE_ID = 'e2eShare1';

/** Tritanium and Pyerite, at quantities large enough that every total renders as a real multi-character ISK figure rather than a two-digit one that would fit anywhere. */
const TRITANIUM = 34;
const PYERITE = 35;

const SNAPSHOT = {
  v: 1,
  hub: 'jita',
  pricePercent: 100,
  generatedAt: 1_750_000_000,
  items: [
    {
      typeId: TRITANIUM,
      name: 'Tritanium',
      quantity: 3_400_000,
      buy: 5.41,
      sell: 5.68,
      unitVolume: 0.01,
    },
    {
      typeId: PYERITE,
      name: 'Pyerite',
      quantity: 1_750_000,
      buy: 11.2,
      sell: 12.04,
      unitVolume: 0.01,
    },
  ],
};

/** A JS value in Firestore's REST wire encoding — the shape a document read returns. */
function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toFirestoreValue(v)])
      ),
    },
  };
}

/**
 * Answers the share read. Firestore Lite's `getDoc` is a `documents:batchGet`
 * POST whose response is a JSON array of `{ found }` entries; the document's
 * own name is echoed from the request so the SDK matches it to the key.
 */
async function mockShare(page: Page): Promise<void> {
  await page.route(/firestore\.googleapis\.com\/.*documents:batchGet/, async (route) => {
    const request = route.request().postDataJSON() as { documents: string[] };
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          found: {
            name: request.documents[0],
            fields: {
              type: { stringValue: 'appraisal' },
              payload: toFirestoreValue(SNAPSHOT),
              createdAt: { timestampValue: now },
              expiresAt: { timestampValue: expiresAt },
            },
            createTime: now,
            updateTime: now,
          },
          readTime: now,
        },
      ]),
    });
  });
}

async function openShare(page: Page): Promise<void> {
  await page.goto(`./share/${SHARE_ID}`);
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
    await mockShare(page);
  });

  test('pairs its six value columns two-per-row at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openShare(page);

    const { display, contentWidth, cells } = await readRow(page, TRITANIUM);
    expect(display).toBe('grid');

    // Six values under a full-width title: 2+2+2. Asserted as the whole card
    // at once — a per-pair check would pass just as happily on a card that
    // had quietly dropped a column.
    expect(labelLines(cells)).toEqual([
      ['Item'],
      ['Qty', 'Buy each'],
      ['Sell each', 'Buy total'],
      ['Sell total', 'Volume (m³)'],
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

    const [firstOfPair] = valueLines[0];
    const [lastLineStart] = valueLines.at(-1)!;
    // The last pair stays in step with the first: same track, same width.
    expect(lastLineStart.left).toBeCloseTo(firstOfPair.left, 0);
    expect(lastLineStart.width).toBeCloseTo(firstOfPair.width, 0);
    // Its label sits above the value in flow, not pinned into the default
    // card's 6.5rem gutter — which inside a ~160px cell would leave the
    // figure nowhere to render.
    expect(lastLineStart.labelPosition).toBe('static');

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
    // row is still a table row, all six values plus the name on one line.
    expect(display).toBe('table-row');
    expect(labelLines(cells)).toEqual([
      ['Qty', 'Item', 'Buy each', 'Sell each', 'Buy total', 'Sell total', 'Volume (m³)'],
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
