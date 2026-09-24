/**
 * Skill Plan editor: "Import from skill queue" on a non-empty plan (#1402).
 *
 * The one-row queue is seeded via a `page.route` override on
 * `GET /characters/{id}/skillqueue`, registered before `signInAndGoto` — the
 * same pattern `mailNarrow.spec.ts`/`openOrdersNarrow.spec.ts` use for a
 * boot-time prefetch. `app/prefetch.ts` calls `loadCharacterSkillQueue`
 * immediately after login and caches whatever it gets for
 * `STALE_AFTER.default` (10 minutes); overriding the route after sign-in
 * would leave that boot fetch's already-cached empty result in place with
 * nothing left to force a live re-fetch.
 */
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

  await expect(page.getByRole('button', { name: 'Remove Caldari Cruiser' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Spaceship Command' })).toBeVisible();
});
