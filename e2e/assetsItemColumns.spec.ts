import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

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
      await page.goto(`./assets/items/${STATION}`);
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
      expect(heights[0]).toBeLessThanOrEqual(49);
    });
  });
}

test('the label strip is absent below md', async ({ page }) => {
  await seedAssets(page);
  await signInAndGoto(page);
  await page.setViewportSize(PHONE);
  await page.goto(`./assets/items/${STATION}`);
  await expect(page.getByText('Mjolnir Auto-Targeting Light Missile I')).toBeVisible();
  await expect(page.getByTestId('item-column-labels')).toBeHidden();
});

for (const width of [1280, 390]) {
  test(`the Tools menu fits the viewport at ${width}px and lists no tab destinations`, async ({
    page,
  }) => {
    await seedAssets(page);
    await signInAndGoto(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`./assets/items/${STATION}`);
    await expect(page.getByText('Mjolnir Auto-Targeting Light Missile I')).toBeVisible();
    await page.getByRole('button', { name: 'Tools' }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('View', { exact: true })).toBeVisible();

    await expect(menu.getByRole('menuitem', { name: /^Refresh/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^My ships/ })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: /^Plan a move/ })).toHaveCount(0);

    const menuBox = await menu.boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width);
  });
}

for (const width of [1280, 1024, 390]) {
  test(`an unpriced item's dash shares the value column at ${width}px`, async ({ page }) => {
    await seedAssets(page);
    await signInAndGoto(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`./assets/items/${STATION}`);
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
