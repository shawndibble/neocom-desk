/**
 * Item Detail's header actions by width (DESIGN.md §6c Header controls).
 * Below `md` "Open in EVE" and "View in Market" share one ⋮, so the
 * item name keeps the header's room; from `md` up they are two text buttons.
 * Two text buttons at 390px squeezed the title to one letter (#3962).
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

/** Rifter. */
const TYPE_ID = 587;

for (const width of [390, 768, 1280]) {
  test(`Item Detail header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // The best sell/buy line reads the order book; no orders is enough here.
    await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await signInAndGoto(page, `./overview?info=type-${TYPE_ID}`);
    const dialog = page.getByRole('dialog', { name: 'Rifter' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const more = dialog.getByRole('button', { name: 'More actions for Rifter' });
    const market = dialog.getByRole('link', { name: 'View in Market' });
    if (width < 768) {
      await expect(more).toBeVisible();
      await expect(market).toHaveCount(0);
      // The name is not cut short by the header's controls.
      const title = dialog.getByRole('heading', { name: 'Rifter' });
      const { scroll, client } = await title.evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
      }));
      expect(scroll).toBeLessThanOrEqual(client);
      await more.click();
      await expect(page.getByRole('menuitem', { name: /Open in EVE/ })).toBeVisible();
      await page.getByRole('menuitem', { name: 'View in Market' }).click();
      await expect(page).toHaveURL(new RegExp(`/market/browser\\?.*type=${TYPE_ID}`));
    } else {
      await expect(market).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Open in EVE: Rifter' })).toBeVisible();
      await expect(more).toHaveCount(0);
    }
  });
}
