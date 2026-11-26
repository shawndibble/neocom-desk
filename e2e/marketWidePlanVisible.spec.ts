import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const TREES = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/marketWideTrees.json'), 'utf8')
) as Record<string, { materials: Array<{ typeID: number }> }>;
const PRODUCT_IDS = new Set(Object.keys(TREES));
const ALL_IDS = new Set<string>(PRODUCT_IDS);
for (const tree of Object.values(TREES)) {
  for (const material of tree.materials) ALL_IDS.add(String(material.typeID));
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

function aggregateFor(typeId: string) {
  const isProduct = PRODUCT_IDS.has(typeId);
  const price = isProduct ? 10_000_000 : 10;
  const volume = isProduct ? 50 : 1_000_000;
  return {
    buy: { max: String(price * 0.9), volume: String(volume), orderCount: '10' },
    sell: { min: String(price), volume: String(volume), orderCount: '10' },
  };
}

async function mockMarketWide(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/markets/prices**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(
        [...ALL_IDS].map((id) => {
          const price = PRODUCT_IDS.has(id) ? 10_000_000 : 10;
          return { type_id: Number(id), average_price: price, adjusted_price: price };
        })
      ),
    })
  );

  await page.route('https://market.fuzzwork.co.uk/**', (route) => {
    const types = (new URL(route.request().url()).searchParams.get('types') ?? '')
      .split(',')
      .filter(Boolean);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(Object.fromEntries(types.map((id) => [id, aggregateFor(id)]))),
    });
  });

  await page.route(/^https:\/\/esi\.evetech\.net\/(?:[^/]+\/)?markets\/\d+\/orders/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' })
  );

  await page.route(
    /^https:\/\/esi\.evetech\.net\/(?:[^/]+\/)?markets\/\d+\/history(?:[/?]|$)/,
    (route) => {
      const days = Array.from({ length: 30 }, (_, i) => {
        const date = new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10);
        return {
          date,
          average: 10_000_000,
          highest: 10_500_000,
          lowest: 9_500_000,
          order_count: 20,
          volume: 40,
        };
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: JSON.stringify(days),
      });
    }
  );
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function headerBoxes(headers: Locator): Promise<Array<{ name: string; box: Box }>> {
  const out: Array<{ name: string; box: Box }> = [];
  for (const header of await headers.all()) {
    const box = await header.boundingBox();
    if (box) out.push({ name: ((await header.innerText()) || '(blank)').trim(), box });
  }
  return out;
}

const WIDTHS = [1024, 1280] as const;

test.describe('Market-wide opportunities fit the viewport (issue #3071)', () => {
  test.beforeEach(async ({ page }) => {
    await mockMarketWide(page);
    await signInAndGoto(page);
  });

  for (const width of WIDTHS) {
    test(`Plan stays on screen, no sideways scroll, no header overlap at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./industry/opportunities');

      const scan = page.getByRole('button', { name: 'Scan', exact: true });
      const unfold = page.getByRole('button', { name: 'Show details' });
      await expect(scan.or(unfold.last())).toBeVisible();
      if (!(await scan.isVisible())) await unfold.last().click();
      await scan.click();

      const table = page.getByRole('table', { name: "What's profitable" });
      await expect(table).toBeVisible({ timeout: 30_000 });
      const planButtons = table.getByRole('button', { name: 'Plan', exact: true });
      await expect.poll(() => planButtons.count()).toBeGreaterThanOrEqual(3);
      await expect(page.getByText(/Checking sales/)).toHaveCount(0);

      const planBox = await planButtons.first().boundingBox();
      expect(planBox, 'first Plan button has a box').not.toBeNull();
      expect(planBox!.x + planBox!.width).toBeLessThanOrEqual(width);
      expect(planBox!.x).toBeGreaterThanOrEqual(0);

      const metrics = await table.evaluate((el) => {
        const wrapper = el.closest('.overflow-x-auto') as HTMLElement | null;
        const target = wrapper ?? el.parentElement!;
        return {
          scrollWidth: target.scrollWidth,
          clientWidth: target.clientWidth,
          found: !!wrapper,
        };
      });
      expect(metrics.found, 'overflow-x-auto wrapper exists').toBe(true);
      expect(
        metrics.scrollWidth,
        `table wrapper scrolls sideways (scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth})`
      ).toBeLessThanOrEqual(metrics.clientWidth);

      const boxes = await headerBoxes(table.getByRole('columnheader'));
      expect(boxes.length).toBeGreaterThan(3);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const overlapX =
            Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
          const overlapY =
            Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);
          expect(
            overlapX > 1 && overlapY > 1,
            `headers "${a.name}" and "${b.name}" overlap (${overlapX}px x ${overlapY}px)`
          ).toBe(false);
        }
      }
    });
  }
});
