import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import type { Page } from '@playwright/test';

const ALIGNMENT_TOLERANCE_PX = 1;

const LINE_TOLERANCE_PX = 8;

const JITA_4_4 = 60003760;
const AMARR_VIII = 60008494;
const THE_FORGE = 10000002;
const DOMAIN = 10000043;

const TOUCH_TARGET_PX = 36;

const DAY_MS = 24 * 60 * 60 * 1000;

function courierSnapshotRows() {
  const rows = [];
  for (let index = 0; index < 24; index += 1) {
    rows.push({
      contractId: 4_000_000 + index,
      regionId: THE_FORGE,
      originLocationId: JITA_4_4,
      destinationLocationId: AMARR_VIII,
      reward: 5_000_000 + index * 100_000,
      volume: 10_000,
      collateral: 100_000_000,
      daysToComplete: 5,
      dateExpired: Date.now() + 7 * DAY_MS,
    });
  }
  rows.push({
    contractId: 4_999_999,
    regionId: THE_FORGE,
    originLocationId: JITA_4_4,
    destinationLocationId: AMARR_VIII,
    reward: 30_000_000,
    volume: 5_000,
    collateral: 250_000_000,
    daysToComplete: 3,
    dateExpired: Date.now() + 7 * DAY_MS,
  });
  return rows;
}

function courierSnapshotRowsWithReverseLane() {
  return [
    ...courierSnapshotRows(),
    {
      contractId: 4_999_998,
      regionId: DOMAIN,
      originLocationId: AMARR_VIII,
      destinationLocationId: JITA_4_4,
      reward: 6_000_000,
      volume: 10_000,
      collateral: 100_000_000,
      daysToComplete: 5,
      dateExpired: Date.now() + 7 * DAY_MS,
    },
  ];
}

async function seedCourierSnapshot(page: Page, rows: unknown[]): Promise<void> {
  await page.evaluate(async (seeded) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('esiCache', 'readwrite');
      tx.objectStore('esiCache').put({
        characterId: 0,
        key: 'publicCourierContracts',
        value: { rows: seeded, lastSyncedAt: Date.now() },
        fetchedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, rows);
}

interface CardEdges {
  cornerRight: number;
  badgeRight: number;
  cardContentRight: number;
  cornerTop: number;
  primaryTop: number;
  cornerBottom: number;
  metaTop: number;
}

async function expandLane(page: Page): Promise<void> {
  const table = page.getByRole('table', { name: 'Courier Contract Search' });
  const toggle = table.locator('tr.dt-group-header button').first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test.describe('courier board — 390px width', () => {
  test.use({ viewport: PHONE });

  test('the ISK/jump figure heads the dense card at its right edge', async ({ page }) => {
    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRows());

    await page.goto('./contracts');
    await page.getByRole('main').getByRole('tab', { name: 'Courier' }).click();

    const table = page.getByRole('table', { name: 'Courier Contract Search' });
    const header = table.locator('tr.dt-group-header').first();
    await expect(header).toContainText('25 hauls');
    await expect(header).toContainText('Over rate');

    await expandLane(page);
    const card = table.locator('tr.dt-group-member').first();
    const corner = card.locator('td.dt-corner');
    await expect(corner).toContainText(/going rate/);
    await expect(corner.getByText(/going rate/)).toBeVisible();

    const edges = await card.evaluate((row): CardEdges => {
      const cell = (selector: string): Element => {
        const found = row.querySelector(selector);
        if (!found) throw new Error(`No ${selector} on the dense card`);
        return found;
      };
      const cornerCell = cell('td.dt-corner');
      const stack = cornerCell.querySelector('div');
      if (!stack) throw new Error('ISK/jump cell is not the two-line flex cell');
      const badge = stack.querySelector('span');
      if (!badge) throw new Error('ISK/jump cell shows no going-rate badge');
      const figure = stack.firstChild;
      if (!figure) throw new Error('ISK/jump cell rendered no figure');
      let glyphsRight = -Infinity;
      const walker = document.createTreeWalker(figure, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent?.trim() || text.parentElement?.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        glyphsRight = Math.max(glyphsRight, range.getBoundingClientRect().right);
      }
      const rowBox = row.getBoundingClientRect();
      const cornerBox = cornerCell.getBoundingClientRect();
      return {
        cornerRight: glyphsRight,
        badgeRight: badge.getBoundingClientRect().right,
        cardContentRight: rowBox.right - parseFloat(getComputedStyle(row).paddingRight),
        cornerTop: cornerBox.top,
        primaryTop: cell('td.dt-primary').getBoundingClientRect().top,
        cornerBottom: cornerBox.bottom,
        metaTop: cell('td.dt-meta').getBoundingClientRect().top,
      };
    });

    const measured =
      `figure right ${Math.round(edges.cornerRight)}px, ` +
      `badge right ${Math.round(edges.badgeRight)}px, ` +
      `card content right ${Math.round(edges.cardContentRight)}px, ` +
      `corner top ${Math.round(edges.cornerTop)}px vs route top ${Math.round(edges.primaryTop)}px`;

    expect(
      Math.abs(edges.cornerRight - edges.cardContentRight),
      `ISK/jump figure does not reach the card's right padding edge — ${measured}`
    ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
    expect(
      Math.abs(edges.badgeRight - edges.cornerRight),
      `Going-rate badge is not right-aligned under the figure — ${measured}`
    ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
    expect(
      Math.abs(edges.cornerTop - edges.primaryTop),
      `ISK/jump cell is not on the route's line — ${measured}`
    ).toBeLessThanOrEqual(LINE_TOLERANCE_PX);
    expect(
      edges.cornerBottom,
      `ISK/jump cell runs into the meta line below it — ${measured}`
    ).toBeLessThanOrEqual(edges.metaTop + ALIGNMENT_TOLERANCE_PX);
  });

  test('the reverse-lane link meets the touch tier (issue #1150)', async ({ page }) => {
    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRowsWithReverseLane());

    await page.goto('./contracts');
    await page.getByRole('main').getByRole('tab', { name: 'Courier' }).click();

    const table = page.getByRole('table', { name: 'Courier Contract Search' });
    await expandLane(page);
    await table.getByRole('row', { name: /30,000,000\.00 ISK/ }).click();

    const reverseLaneLink = page.getByRole('button', { name: /reverse lane/ });
    await expect(reverseLaneLink).toBeVisible();

    const box = await reverseLaneLink.boundingBox();
    expect(box, 'reverse-lane link has no layout box').not.toBeNull();
    expect(
      box!.height,
      `reverse-lane link is only ${box!.height}px tall at 390px width`
    ).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  });

  test('the ISK filters take shorthand and group digits as typed (issue #1722)', async ({
    page,
  }) => {
    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRows());

    await page.goto('./contracts');
    await page.getByRole('main').getByRole('tab', { name: 'Courier' }).click();
    await page.getByRole('button', { name: /^Filters/ }).click();

    const minReward = page.getByRole('textbox', { name: 'Min reward' });
    await minReward.fill('1b');
    await expect(minReward).toHaveValue('1b');
    const maxCollateral = page.getByRole('textbox', { name: 'Max collateral' });
    await maxCollateral.fill('500000000');
    await expect(maxCollateral).toHaveValue('500,000,000');
  });
});

for (const width of [1024, 1440]) {
  test.describe(`courier board — ${width}px width`, () => {
    test.use({ viewport: { width, height: 768 } });

    test('the table fits its panel and Expires shows date and time', async ({ page }) => {
      await signInAndGoto(page);
      await seedCourierSnapshot(page, courierSnapshotRows());

      await page.goto('./contracts');
      await page.getByRole('main').getByRole('tab', { name: 'Courier' }).click();

      const table = page.getByRole('table', { name: 'Courier Contract Search' });
      const lastCell = table.locator('tbody tr').first().locator('td').last();
      await expect(lastCell).toBeVisible();

      const panelRight = await table.evaluate((element) => {
        let node = element.parentElement;
        while (node && parseFloat(getComputedStyle(node).borderLeftWidth) === 0) {
          node = node.parentElement;
        }
        return (node ?? document.documentElement).getBoundingClientRect().right;
      });
      const cellBox = await lastCell.boundingBox();
      const tableBox = await table.boundingBox();
      expect(cellBox!.x + cellBox!.width).toBeLessThanOrEqual(panelRight + ALIGNMENT_TOLERANCE_PX);
      expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(
        panelRight + ALIGNMENT_TOLERANCE_PX
      );

      const parts = lastCell.locator('span:visible');
      await expect(parts).toHaveCount(2);
      const [dateBox, timeBox] = await Promise.all([
        parts.nth(0).boundingBox(),
        parts.nth(1).boundingBox(),
      ]);
      expect(timeBox!.y).toBeGreaterThan(dateBox!.y);
      await expect(parts.nth(1)).toHaveText(/\d{1,2}:\d{2}/);
    });
  });
}
