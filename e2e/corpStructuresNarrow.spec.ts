import { test, expect, PHONE } from './support/testBase';
import { openCorpOverview, overflow } from './support/corpBoard';
import { CORPORATION_ID } from './support/fixtureData';

const BAYS = [150_000, 900, 40];

const assets = BAYS.map((quantity, index) => ({
  item_id: index + 1,
  type_id: 4051,
  quantity,
  location_id: index + 1,
  location_type: 'other',
  location_flag: 'StructureFuel',
  is_singleton: false,
}));

test.describe('Structures on a phone', () => {
  test('blocks share the second line and offline services are named', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openCorpOverview(page, (path) =>
      path === `/corporations/${CORPORATION_ID}/assets` ? assets : undefined
    );
    await page.goto('./corp/structures');

    const rows = page.locator('#route-outlet tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('150,000');
    const heights = await rows.evaluateAll((trs) =>
      trs.map((tr) => {
        const cell = [...tr.querySelectorAll('td')].find((td) =>
          /^\s*(150,000|900|40)\s*(Rate updating)?\s*$/.test(td.textContent ?? '')
        );
        return cell ? cell.getBoundingClientRect().height : -1;
      })
    );
    for (const height of heights) expect(height).toBeGreaterThan(0);
    for (const height of heights) expect(height).toBeLessThanOrEqual(20);
    for (const caption of await page.getByText(/Rate updating|\/day/).all()) {
      await expect(caption).toBeHidden();
    }

    await expect(page.locator('#route-outlet').getByText('1 offline')).toHaveCount(1);
    for (const width of [390, 412]) {
      await page.setViewportSize({ width, height: 844 });
      const { scrollWidth, clientWidth, offenders } = await overflow(page);
      expect(scrollWidth, `${width}px: ${offenders.join(', ')}`).toBeLessThanOrEqual(clientWidth);
    }
  });
});
