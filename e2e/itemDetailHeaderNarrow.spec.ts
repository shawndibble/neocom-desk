/**
 * Item Detail's header actions by width (DESIGN.md §6c Header controls).
 * The header carries one action, "Open in EVE", as a plain button at every
 * width, so the item name keeps the header's room (two text buttons at 390px
 * once squeezed the title to one letter, #3962). The modal's one market entry
 * point is its Market tab, which holds the "Open in Market Browser" link.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

/** Rifter. */
const TYPE_ID = 587;

for (const width of [390, 768, 1280]) {
  test(`Item Detail header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // The best sell/buy line reads the order book, the Market tab the history; empty is enough here.
    await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.route('https://esi.evetech.net/markets/*/history*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await signInAndGoto(page, `./overview?info=type-${TYPE_ID}`);
    const dialog = page.getByRole('dialog', { name: 'Rifter' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(dialog.getByRole('button', { name: 'Open in EVE: Rifter' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'More actions for Rifter' })).toHaveCount(0);
    const market = dialog.getByRole('link', { name: 'Open in Market Browser' });
    await expect(market).toHaveCount(0);
    // The name is not cut short by the header's controls.
    const title = dialog.getByRole('heading', { name: 'Rifter' });
    const { scroll, client } = await title.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);

    await dialog.getByRole('tab', { name: 'Market' }).click();
    await market.click();
    await expect(page).toHaveURL(new RegExp(`/market/browser\\?.*type=${TYPE_ID}`));
  });
}
