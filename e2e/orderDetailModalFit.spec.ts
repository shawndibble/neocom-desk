/**
 * Order detail modal at in-between widths (issue #2988): on a foldable's
 * unfolded inner screen (~900 CSS px) the `wide` modal grew past the viewport,
 * pushing its close button off screen. Asserts invariants only — the dialog
 * fits the viewport, its close button is inside it and works, and the body
 * does not scroll sideways — never pixel values, since CI's fonts differ.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import type { MarketOrder } from '../src/esi/endpoints';

const WIDTHS = [700, 800, 900, 1000];

const ORDER: MarketOrder = {
  order_id: 201,
  type_id: 36,
  price: 300,
  region_id: 10000002,
  location_id: 60003760,
  is_buy_order: false,
  is_corporation: false,
  volume_remain: 5,
  volume_total: 5,
  issued: new Date().toISOString(),
  duration: 5,
  range: 'station',
};

async function seed(page: Page): Promise<void> {
  await page.route(`**/characters/${CHARACTER_ID}/orders`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([ORDER]),
    })
  );
  await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/markets/*/history*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/route/*/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ route: [30000142] }),
    })
  );
}

for (const width of WIDTHS) {
  test(`order detail modal fits a ${width}px viewport and closes`, async ({ page }) => {
    await seed(page);
    await signInAndGoto(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./market/orders');

    // Below `lg` the list may be tap rows; above it a table whose row click opens the detail.
    const row = page
      .getByRole('button', { name: /^Mexallon/ })
      .or(page.getByRole('row', { name: /Mexallon/ }));
    await row.first().click({ position: { x: 4, y: 4 } });
    const dialog = page.getByRole('dialog', { name: /Mexallon/ });
    await expect(dialog).toBeVisible();

    const box = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);

    const close = dialog.getByRole('button', { name: 'Close' });
    const closeRight = await close.evaluate((el) => el.getBoundingClientRect().right);
    expect(closeRight).toBeLessThanOrEqual(width);

    // Nothing inside may push the dialog's content wider than the dialog.
    const overflow = await dialog.evaluate((el) => {
      const widest = Math.max(...Array.from(el.querySelectorAll('*')).map((n) => n.scrollWidth));
      return { widest, client: el.clientWidth };
    });
    expect(overflow.widest).toBeLessThanOrEqual(overflow.client);

    await close.click();
    await expect(dialog).toBeHidden();
  });
}
