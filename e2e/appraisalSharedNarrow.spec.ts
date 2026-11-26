import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';

const TABLE = 'Shared appraisal';

const SHARE_ID = 'e2eShare1';

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
  await page.goto(`./s/${SHARE_ID}`);
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
  contentWidth: number;
  rowHeight: number;
  cells: CellBox[];
}

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

  test('stays a plain table at 390px, shedding the per-unit prices', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openShare(page);

    const { display, cells } = await readRow(page, TRITANIUM);
    expect(display).toBe('table-row');

    const shown = cells.filter((cell) => cell.width > 0).map((cell) => cell.label);
    expect(shown).toEqual(['Item', 'Qty', 'Buy total', 'Sell total']);

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

  test('puts the brand and the way in at the top, without overflow, at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openShare(page);

    const header = page.getByRole('banner').first();
    const login = header.getByRole('button', { name: 'Log in' });
    const brand = header.getByRole('link', { name: 'Neocom Desk' });
    await expect(login).toBeVisible();
    await expect(brand).toBeVisible();

    const [headerBox, loginBox, brandBox] = await Promise.all([
      header.boundingBox(),
      login.boundingBox(),
      brand.boundingBox(),
    ]);
    expect(loginBox!.y + loginBox!.height).toBeLessThan(PHONE.height);
    expect(loginBox!.x).toBeGreaterThanOrEqual(0);
    expect(loginBox!.x + loginBox!.width).toBeLessThanOrEqual(PHONE.width);
    expect(loginBox!.y + loginBox!.height).toBeLessThanOrEqual(
      headerBox!.y + headerBox!.height + 1
    );
    const apart =
      loginBox!.y >= brandBox!.y + brandBox!.height - 1 ||
      loginBox!.x >= brandBox!.x + brandBox!.width - 1;
    expect(apart).toBe(true);
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
    expect(display).toBe('table-row');
    expect(labelLines(cells)).toEqual([
      ['Item', 'Qty', 'Buy each', 'Sell each', 'Split each', 'Buy total', 'Sell total'],
    ]);
    expect(rowHeight).toBeLessThan(40);
    for (const cell of cells) expect(cell.width).toBeLessThan(contentWidth * 0.9);
  });
});
