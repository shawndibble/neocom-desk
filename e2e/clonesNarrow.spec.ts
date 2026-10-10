/**
 * Clones on a phone (issue #3487): the training verdict leads the page, ahead
 * of the cooldown / "You are in" / Respawn panels. From md up the panels keep
 * their place above it.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const STATION = 60003760;

function clone(id: number) {
  return {
    jump_clone_id: id,
    location_id: STATION,
    location_type: 'station',
    implants: [],
  };
}

async function tops(page: import('@playwright/test').Page) {
  const verdict = page.getByRole('region', { name: 'Training verdict' });
  const panel = page.getByRole('region', { name: 'You are in' });
  await expect(verdict).toBeVisible();
  await expect(panel).toBeVisible();
  return {
    verdict: (await verdict.boundingBox())!.y,
    panel: (await panel.boundingBox())!.y,
  };
}

for (const withClones of [true, false]) {
  const state = withClones ? 'a verdict from 2 jump clones' : 'a note verdict';
  test(`the verdict sits above the summary panels at 390px with ${state}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (withClones) {
      await page.route(`**/characters/${CHARACTER_ID}/clones`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jump_clones: [clone(1), clone(2)] }),
        })
      );
    }
    await signInAndGoto(page, './clones');
    const y = await tops(page);
    expect(y.verdict).toBeLessThan(y.panel);
  });
}

test('the summary panels stay above the verdict at 1024px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signInAndGoto(page, './clones');
  const y = await tops(page);
  expect(y.panel).toBeLessThan(y.verdict);
});
