/** Shared Skill Plan interactions for plans.spec.ts. */
import type { Page } from '@playwright/test';
import { expect } from './testBase';

/**
 * Creates a plan and adds "Caldari Cruiser" (level I) via the skill picker.
 * Waits for the entry to actually land before returning: `SkillPlans`'s
 * `useLiveQuery`-backed plan list can transiently re-render its editor
 * subtree (remounting the picker, losing its in-progress query/selection)
 * while Dexie settles right after plan creation. Confirming the entry
 * appeared rules that race out for every step that follows.
 */
export async function addCaldariCruiserToNewPlan(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await expect(page.getByPlaceholder('Search skills…')).toBeVisible();

  await page.getByPlaceholder('Search skills…').fill('Caldari Cruiser');
  await page.getByRole('button', { name: /Caldari Cruiser/ }).click();
  await page.getByRole('button', { name: 'Level I', exact: true }).click();

  // The merged entry row renders "{name} {level}" as sibling text nodes in
  // one <span> (no element exposes the bare skill name), so wait on the
  // row's icon-only remove button instead — its accessible name is
  // "Remove {name}", unambiguous and immune to that text-node splitting.
  await expect(page.getByRole('button', { name: 'Remove Caldari Cruiser' })).toBeVisible();
}
