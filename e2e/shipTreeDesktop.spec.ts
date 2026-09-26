/**
 * Ships › Tree on a desktop (scope decision `20260926-135538`): the map is
 * the default view, a hull shows its hover card, a click opens the Ship Info
 * window's four tabs, and Simulate lands in the Fittings editor with a new
 * Fitting of that hull. Structure only — no stat figure is awaited.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const MERLIN = 603;

/** The editor resolves the hull's dogma through /universe/types. */
async function answerAnyType(page: Page) {
  await page.route(/\/universe\/types\/\d+$/, async (route) => {
    const typeId = Number(/\/universe\/types\/(\d+)$/.exec(route.request().url())![1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type_id: typeId,
        name: `Type ${typeId}`,
        description: '',
        group_id: 25,
        published: true,
        dogma_attributes: [],
      }),
    });
  });
}

test.describe('Ship Tree — desktop', () => {
  test('map, hover card, Ship Info tabs, Simulate into the editor', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await answerAnyType(page);
    await signInAndGoto(page, './ships/tree');

    const map = page.getByRole('region', { name: 'Caldari State ship tree' });
    await expect(map).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('group', { name: 'Ship tree view' }).getByRole('button', { name: 'Map' })
    ).toHaveAttribute('aria-pressed', 'true');

    const merlin = map.locator(`[data-ship="${MERLIN}"]`);
    await merlin.scrollIntoViewIfNeeded();
    await merlin.hover();
    const card = page.getByTestId('ship-tree-hover-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Merlin');
    await expect(card).toContainText('bonuses (per skill level):');

    await merlin.click();
    const info = page.getByRole('dialog', { name: 'Merlin' });
    await expect(info).toBeVisible();
    await expect(card).toBeHidden();
    const box = (await info.boundingBox())!;
    // The ~40rem slide-over, not SlideOver's default 25rem.
    expect(box.width).toBeGreaterThan(600);

    for (const tab of ['Description', 'Fitting', 'Skills & Mastery', 'Blueprint']) {
      await info.getByRole('tab', { name: tab }).click();
      await expect(info.getByRole('tabpanel', { name: tab })).toBeVisible();
    }
    await expect(info.getByText('Merlin Blueprint')).toBeVisible({ timeout: 30_000 });

    await info.getByRole('tab', { name: 'Fitting' }).click();
    await expect(info.getByText('High slots')).toBeVisible();
    await info.getByRole('button', { name: 'Simulate' }).click();
    await expect(page).toHaveURL(/\/ships\/fittings\/edit\?f=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Merlin' })).toBeVisible();
  });
});
