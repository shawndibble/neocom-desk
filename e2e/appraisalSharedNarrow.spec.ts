/**
 * The **Shared Appraisal** page at 390px: a plain table, not stacked cards
 * (DESIGN.md §6c Restraint). Six numeric columns hang off the item name, a
 * table read across columns, so it keeps real columns on a phone — item pinned
 * (`stickyStart`), Buy each / Sell each / Volume shed (`phoneHidden`) — and the
 * page never scrolls sideways. History: #1113 paired the six values into a
 * two-up card; that card is gone.
 *
 * Playwright rather than jsdom: `max-sm:hidden` and the sticky column are CSS
 * a real engine has to evaluate.
 *
 * No login: a Share Link opens for anyone. The share itself is served by
 * mocking Firestore's document read — the e2e build carries a placeholder
 * project id for exactly this (`playwright.config.ts`'s `E2E_ENV`), and no API
 * key, so sync stays off.
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
}

interface RowGeometry {
  display: string;
  /** The `tr`'s own content box — what the cells have to share. */
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

test.describe('Shared appraisal — phone table', () => {
  test.beforeEach(async ({ page }) => {
    await mockShare(page);
  });

  test('stays a plain table at 390px, shedding the per-unit prices and volume', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openShare(page);

    const { display, cells } = await readRow(page, TRITANIUM);
    expect(display).toBe('table-row');

    // Rendered cells only: `phoneHidden` columns are `display: none` here, so
    // they have no box. Asserted as the whole row at once.
    const shown = cells.filter((cell) => cell.width > 0).map((cell) => cell.label);
    expect(shown).toEqual(['Qty', 'Item', 'Buy total', 'Sell total']);

    // The item cell is pinned while the table scrolls sideways inside its
    // wrapper, never the page.
    const sticky = await page
      .locator(`table[aria-label="${TABLE}"] tr[data-row-key="${TRITANIUM}"] td[data-label="Item"]`)
      .evaluate((td) => getComputedStyle(td).position);
    expect(sticky).toBe('sticky');
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
    // Above `sm` nothing is shed: all six values plus the name on one line.
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
