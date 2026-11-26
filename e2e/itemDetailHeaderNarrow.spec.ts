import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const TYPE_ID = 587;

for (const width of [390, 768, 1280]) {
  test(`Item Detail header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
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
