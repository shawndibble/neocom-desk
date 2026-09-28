/**
 * Ships › Tree on a phone (scope decision `20260926-135538`): the ladder is
 * the default view, the map is one tap away and back, a tapped hull opens
 * its Ship Info window, and nothing widens the page past the screen.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';

const MERLIN = 603;

const WIDTHS = [360, 390, 412];

test.describe('Ship Tree — narrow', () => {
  for (const width of WIDTHS) {
    test(`ladder by default, switch to the map and back, open a hull at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await signInAndGoto(page, './ships/tree');

      const views = page.getByRole('group', { name: 'Ship tree view' });
      await expect(views).toBeVisible({ timeout: 30_000 });
      await expect(views.getByRole('button', { name: 'Ladder' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const merlinRow = page.locator(`button[data-ship="${MERLIN}"]`);
      await expect(merlinRow).toBeVisible();
      await expectNoPageOverflow(page);

      const factionButton = page.getByRole('button', { name: /Caldari State/ });
      const box = await factionButton.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      await views.getByRole('button', { name: 'Map' }).click();
      await expect(page.getByRole('region', { name: 'Caldari State ship tree' })).toBeVisible();
      await expectNoPageOverflow(page);

      await views.getByRole('button', { name: 'Ladder' }).click();
      await expect(merlinRow).toBeVisible();

      await merlinRow.click();
      const info = page.getByRole('dialog', { name: 'Merlin' });
      await expect(info).toBeVisible();
      await info.getByRole('tab', { name: 'Fitting' }).click();
      await expect(info.getByText('High slots')).toBeVisible();
      // Nothing (the phone tab bar, say) sits over the sheet's own actions.
      await info.getByRole('button', { name: 'Simulate' }).click({ trial: true });
      await expectNoPageOverflow(page);
    });
  }

  test('the choice is remembered across a reload', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await signInAndGoto(page, './ships/tree');
    const views = page.getByRole('group', { name: 'Ship tree view' });
    await views.getByRole('button', { name: 'Map' }).click();
    await expect(page.getByRole('region', { name: 'Caldari State ship tree' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('region', { name: 'Caldari State ship tree' })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoPageOverflow(page);
  });
});
