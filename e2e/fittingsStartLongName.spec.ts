/**
 * Fittings Start list (issue #2001): a long fitting name truncates inside its
 * row instead of pushing the row's actions menu and source badge out of line.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const LONG_NAME = 'Rifter - Solo PvP Kiter Long Name Here That Goes On And On Forever';

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`a long fitting name keeps every row's badge and actions menu aligned at ${size.width}px`, async ({
    page,
  }) => {
    await page.route(/\/characters\/\d+\/fittings\/?(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ['Short A', LONG_NAME, 'Short B', 'Short C'].map((name, i) => ({
            fitting_id: i + 1,
            name,
            description: '',
            ship_type_id: 587,
            items: [{ flag: 'HiSlot0', quantity: 1, type_id: 484 }],
          }))
        ),
      })
    );
    await page.route(/\/universe\/types\/\d+$/, (route) => {
      const typeId = Number(/\/universe\/types\/(\d+)$/.exec(route.request().url())![1]);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type_id: typeId,
          name: `Type ${typeId}`,
          description: '',
          group_id: 46,
          published: true,
          dogma_attributes: [],
        }),
      });
    });
    await page.setViewportSize(size);
    await signInAndGoto(page, './fittings');

    const list = page.getByRole('navigation', { name: /fittings/i }).first();
    const longRow = page.getByRole('button', { name: new RegExp(`^${LONG_NAME}`) });
    await expect(longRow).toBeVisible({ timeout: 60_000 });

    const dims = await list.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(dims.scrollWidth).toBe(dims.clientWidth);

    const nameSpan = longRow.locator('span').first();
    const nameDims = await nameSpan.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(nameDims.scrollWidth).toBeGreaterThan(nameDims.clientWidth);

    const listBox = (await list.boundingBox())!;
    const rows = list.locator('li');
    const count = await rows.count();
    expect(count).toBe(4);
    const badgeRights = new Set<number>();
    const menuRights = new Set<number>();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const badge = (await row.locator('button').first().locator('span').last().boundingBox())!;
      const menu = (await row.locator('button').last().boundingBox())!;
      expect(menu.x).toBeGreaterThanOrEqual(listBox.x);
      expect(menu.x + menu.width).toBeLessThanOrEqual(listBox.x + listBox.width);
      badgeRights.add(Math.round(badge.x + badge.width));
      menuRights.add(Math.round(menu.x + menu.width));
    }
    expect(badgeRights.size).toBe(1);
    expect(menuRights.size).toBe(1);
  });
}
