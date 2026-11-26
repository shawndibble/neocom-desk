import { test, expect } from './support/testBase';
import { openCorpOverview, overflow } from './support/corpBoard';

test.describe('Corp Board widget grid', () => {
  test('draws the default widgets with no horizontal scroll from 320px to 1920px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openCorpOverview(page);
    for (const name of [
      'Due soon',
      'Structures',
      'Moon extractions',
      'Corp industry jobs',
      'Corp wallet',
      'Cash flow',
      'Members',
      'Inactive members',
      'Income by source',
    ]) {
      await expect(page.getByRole('region', { name, exact: true }), name).toBeVisible();
    }
    for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const { scrollWidth, clientWidth, offenders } = await overflow(page);
      expect(
        scrollWidth,
        `${width}px: page is ${scrollWidth}px wide in ${clientWidth}px. Widest: ${offenders.join(', ')}`
      ).toBeLessThanOrEqual(clientWidth);
    }
  });

  test('customizes: the Gallery offers corp widgets only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openCorpOverview(page);
    await page.locator('#route-outlet').getByRole('button', { name: 'Customize' }).click();
    await page.getByRole('button', { name: 'Add widget' }).click();
    const gallery = page.getByRole('dialog', { name: 'Add a widget' });
    await gallery.getByRole('button', { name: 'Not on your board' }).click();
    await expect(gallery.getByText('Moon mining ledger')).toBeVisible();
    await expect(gallery.getByText('Training', { exact: true })).toHaveCount(0);
  });
});
