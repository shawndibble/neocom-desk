import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';
import type { RegionOrder } from '../src/esi/endpoints';

const REGION = 10000002;
const TRITANIUM = 34;
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
  await page.route('**/markets/*/orders*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes(`/markets/${REGION}/`) ? [SELL_ORDER, BUY_ORDER] : []
      ),
    })
  );
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

async function openTritanium(page: Page, { singleStation = false } = {}): Promise<void> {
  await signInAndGoto(page, singleStation ? './market' : './market?browser.jumps=5');
  await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
  await page.getByRole('button', { name: 'Tritanium', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Sell Orders' })).toBeVisible();
}

interface CellBox {
  label: string;
  text: string;
  top: number;
  left: number;
  width: number;
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

async function expectCardMenu(page: Page, tableLabel: string, orderId: number) {
  const row = page.locator(`table[aria-label="${tableLabel}"] tr[data-row-key="${orderId}"]`);
  const more = await row.getByRole('button', { name: /^More actions/ }).boundingBox();
  const card = await row.boundingBox();
  const meta = await row.locator('td.dt-meta').last().boundingBox();
  expect(more!.width).toBeGreaterThanOrEqual(36);
  expect(more!.height).toBeGreaterThanOrEqual(36);
  await expect(row.locator('td.dt-disclosure svg')).toBeHidden();
  await expect(row.locator('.dt-lead-caret')).toBeHidden();
  const dy = Math.abs(more!.y + more!.height / 2 - (card!.y + card!.height / 2));
  expect(dy, `⋮ centre-y vs card centre-y (${tableLabel})`).toBeLessThanOrEqual(1);
  expect(meta!.x + meta!.width, `line two vs ⋮ (${tableLabel})`).toBeLessThanOrEqual(more!.x);
  expect(card!.height, tableLabel).toBeLessThanOrEqual(64);
  const tops = await row
    .locator('td.dt-meta')
    .evaluateAll((tds) =>
      tds
        .filter((td) => td.getBoundingClientRect().width > 0)
        .map((td) => Math.round(td.getBoundingClientRect().top))
    );
  expect(new Set(tops).size, `line two is one line (${tableLabel})`).toBe(1);
}

test.describe('Market Browser — order book stacked cards', () => {
  test.beforeEach(async ({ page }) => {
    await seedOrderBook(page);
  });

  async function expectTwoLineCards(page: Page) {
    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(sell.display).toBe('flex');
    expect(labelLines(sell.cells, 8)).toEqual([
      ['Location', 'Price'],
      ['Qty', 'Jumps', 'Sec', 'Expires'],
    ]);
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
    for (const cell of buy.cells.filter((c) => c.label !== 'Location' && c.label !== 'Range')) {
      expect(cell.clipped, cell.label).toBe(false);
    }
  });

  test('a single-station book drops Location: Price titles the card (390px)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openTritanium(page, { singleStation: true });

    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(labelLines(sell.cells, 8)).toEqual([['Price'], ['Qty', 'Jumps', 'Sec', 'Expires']]);
    for (const cell of sell.cells) expect(cell.clipped, cell.label).toBe(false);
    await expectNoPageOverflow(page);
  });

  test('a single-station book has no Location column on a desktop (1280px)', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openTritanium(page, { singleStation: true });

    const sell = await readRow(page, 'Sell Orders', SELL_ORDER.order_id);
    expect(sell.cells.map((c) => c.label)).not.toContain('Location');
    expect(sell.cells.some((c) => c.text.includes(STATION_A_NAME))).toBe(false);
    await expectNoPageOverflow(page);
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

    const row = page.locator(
      `table[aria-label="Sell Orders"] tr[data-row-key="${SELL_ORDER.order_id}"]`
    );
    await expect(row.locator('td').first().locator('.dt-lead-caret svg')).toBeVisible();
    await expect(row.getByRole('button', { name: /^More actions/ })).toBeVisible();
    await expect(row.locator('td.dt-disclosure svg')).toHaveCount(0);
  });
});

for (const width of [390, 360]) {
  test(`item header buttons are visible, 36px and non-overlapping at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route(/\/markets\/\d+\/orders/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'X-Pages': '1' },
        body: '[]',
      })
    );
    await page.route(/\/universe\/types\/\d+$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type_id: TRITANIUM,
          name: 'Tritanium',
          description: '',
          group_id: 18,
          published: true,
          dogma_attributes: [],
        }),
      })
    );
    await signInAndGoto(page, './market');
    await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
    await page.getByRole('button', { name: 'Tritanium', exact: true }).click();

    const names = [/^Add to Quickbar$/, /^Set price alert$/, /^More actions$/];
    await expect(page.getByRole('heading', { name: 'Tritanium' })).toBeVisible();
    const boxes = [];
    for (const name of names) {
      const button = page.getByRole('button', { name });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box, String(name)).not.toBeNull();
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(36);
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(36);
      expect(box!.x + box!.width, `${name} inside viewport`).toBeLessThanOrEqual(width);
      boxes.push(box!);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `buttons ${i} and ${j} overlap`).toBe(false);
      }
    }
    await expectNoPageOverflow(page);
  });
}
