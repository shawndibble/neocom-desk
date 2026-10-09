/**
 * Assets item rows at md+ (issue #2034): quantity, volume and value used to
 * sit in one unlabelled, left-packed 11px line, so no figure lined up with the
 * one above it. Each is now a fixed-width right-aligned cell under a label
 * strip; this pins that the right edges are shared down the column and under
 * the labels, and that a 40-character name or a 16-digit value cannot push a
 * neighbour.
 *
 * Assets are seeded by overriding the `/assets` route before login, so the
 * boot prefetch caches them (the pattern `openOrdersNarrow.spec.ts` documents).
 * Type 34 has a price in `mockEsi.ts`; a huge quantity of it gives the
 * oversized value. Type 269 is a 38-character name.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

/** Jita 4-4 — a real NPC station id, so name resolution never needs a live ESI call. */
const STATION = 60003760;

function asset(item_id: number, type_id: number, quantity: number) {
  return {
    item_id,
    type_id,
    quantity,
    location_id: STATION,
    location_flag: 'Hangar',
    location_type: 'station',
    is_singleton: false,
  };
}

async function seedAssets(page: Page): Promise<void> {
  // The jumps-away enhancement on the location list reads the current system.
  await page.route('**/universe/systems/30000142', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        system_id: 30000142,
        name: 'Jita',
        security_status: 0.9,
        planets: [],
      }),
    })
  );
  await page.route(`**/characters/${CHARACTER_ID}/assets*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        asset(1, 34, 200_000_000_000_000),
        asset(2, 35, 25),
        asset(3, 269, 4),
        asset(4, 36, 1_200),
      ]),
    })
  );
}

for (const width of [1440, 1280, 1024]) {
  test.describe(`Assets item columns at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await seedAssets(page);
      await signInAndGoto(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`./assets/${STATION}`);
      await expect(page.getByText('Mjolnir Auto-Targeting Light Missile I')).toBeVisible();
    });

    test('quantity, volume and value cells share right edges and sit under their labels', async ({
      page,
    }) => {
      const labels = page.getByTestId('item-column-labels');
      await expect(labels).toBeVisible();

      const rows = page.locator('[data-virtual-scroll-root] [data-index]');
      expect(await rows.count()).toBe(4);

      const rightEdges = async (nth: number) =>
        rows.evaluateAll(
          (els, index) =>
            els.map((row) => {
              const cells = row.querySelectorAll<HTMLElement>('.tabular-nums > span');
              return Math.round(cells[index].getBoundingClientRect().right);
            }),
          nth
        );
      const labelEdges = await labels.evaluate((el) =>
        Array.from(el.children)
          .slice(1, 4)
          .map((c) => Math.round(c.getBoundingClientRect().right))
      );

      // Cell order inside each row's figures span: quantity, dot, volume, dot, value.
      for (const [cell, labelIndex] of [
        [0, 0],
        [2, 1],
        [4, 2],
      ] as const) {
        const edges = await rightEdges(cell);
        expect(new Set(edges).size).toBe(1);
        expect(edges[0]).toBe(labelEdges[labelIndex]);
      }
    });

    test('the figures sit beside the capped name, not at the panel edge', async ({ page }) => {
      const rows = page.locator('[data-virtual-scroll-root] [data-index]');
      const gaps = await rows.evaluateAll((els) =>
        els.map((row) => {
          const cells = row.querySelectorAll<HTMLElement>('.tabular-nums > span');
          const value = cells[4].getBoundingClientRect();
          return {
            left: value.left - row.getBoundingClientRect().left,
            right: value.right,
            rowRight: row.getBoundingClientRect().right,
          };
        })
      );
      const rem = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).fontSize)
      );
      for (const g of gaps) {
        // 24rem name cell + Qty + m3 + gaps: the Value cell starts well inside the row.
        expect(g.left).toBeLessThanOrEqual(40 * rem);
        expect(g.right).toBeLessThanOrEqual(g.rowRight);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('a long name and an oversized value keep every row one line tall', async ({ page }) => {
      const heights = await page
        .locator('[data-virtual-scroll-root] [data-index]')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(new Set(heights).size).toBe(1);
      // 48px row + the 1px bottom border; equal heights are the point.
      expect(heights[0]).toBeLessThanOrEqual(49);
    });
  });
}

test('the label strip is absent below md', async ({ page }) => {
  await seedAssets(page);
  await signInAndGoto(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./assets/${STATION}`);
  await expect(page.getByText('Mjolnir Auto-Targeting Light Missile I')).toBeVisible();
  await expect(page.getByTestId('item-column-labels')).toBeHidden();
});

// #3087: the toggles sit under a "View" caption; the actions below share one left edge.
for (const width of [1280, 390]) {
  test(`the Tools menu actions share a left edge and fit the viewport at ${width}px`, async ({
    page,
  }) => {
    await seedAssets(page);
    await signInAndGoto(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`./assets/${STATION}`);
    await expect(page.getByText('Mjolnir Auto-Targeting Light Missile I')).toBeVisible();
    await page.getByRole('button', { name: 'Tools' }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('View', { exact: true })).toBeVisible();

    const lefts: number[] = [];
    for (const name of [/^My ships/, /^Plan a move/, /^Refresh/]) {
      const item = menu.getByRole('menuitem', { name });
      const box = await item.boundingBox();
      expect(box).not.toBeNull();
      lefts.push(box!.x);
    }
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(1);

    const menuBox = await menu.boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width);
  });
}

// #3116: an item with no estimate (only type 34 is priced here) reads as a dim
// dash in the same value column, not a green "0".
for (const width of [1280, 1024, 390]) {
  test(`an unpriced item's dash shares the value column at ${width}px`, async ({ page }) => {
    await seedAssets(page);
    await signInAndGoto(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`./assets/${STATION}`);
    await expect(page.getByText('Mjolnir Auto-Targeting Light Missile I')).toBeVisible();

    const rows = page.locator('[data-virtual-scroll-root] [data-index]');
    expect(await rows.count()).toBe(4);
    await expect(rows.getByText('No estimate')).toHaveCount(3);
    await expect(rows.locator('.text-isk-pos')).toHaveCount(1);

    const cells = await rows.evaluateAll((els) =>
      els.map((row) => {
        const value = row.querySelector<HTMLElement>('.tabular-nums > span:last-child')!;
        const box = value.getBoundingClientRect();
        return {
          dim: value.classList.contains('text-text-faint'),
          right: Math.round(box.right),
          overflow: value.scrollWidth > value.clientWidth + 1,
        };
      })
    );
    expect(cells.filter((c) => c.dim)).toHaveLength(3);
    expect(cells.some((c) => c.overflow)).toBe(false);
    if (width >= 768) expect(new Set(cells.map((c) => c.right)).size).toBe(1);
  });
}
