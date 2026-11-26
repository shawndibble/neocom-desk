import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { addCaldariCruiserToNewPlan } from './support/planHelpers';
import { CHARACTER_ID, SKILL } from './support/fixtureData';

test('imports the in-game skill queue into an existing plan via Append', async ({ page }) => {
  await page.route(`**/characters/${CHARACTER_ID}/skillqueue`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { skill_id: SKILL.spaceshipCommand, finished_level: 1, queue_position: 0 },
      ]),
    })
  );

  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.waitForURL(/\/skills\/plans$/);
  await addCaldariCruiserToNewPlan(page);

  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('menuitem', { name: 'From skill queue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from skill queue' });
  await expect(dialog.getByText(/in-game queue has 1 skill/i)).toBeVisible();
  await dialog.getByRole('button', { name: 'Append' }).click();

  await expect(
    page.getByRole('button', { name: 'More actions for Caldari Cruiser' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'More actions for Spaceship Command' })
  ).toBeVisible();
});
