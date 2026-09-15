/**
 * Build Group header vs. its member plans, on a phone: a member row is
 * deliberately indented under its group (`PlanRow`'s `pl-6` vs `GroupHeader`'s
 * `px-2` — 16px of nesting, by design). That 16px held at desktop width, but
 * `GroupHeader`'s expand toggle is a real `IconButton size="sm"`
 * (`size-9 md:size-7` — DESIGN.md §3's touch tier, 36px on a phone) while
 * `PlanRow`'s drag handle was a plain button with no responsive sizing of its
 * own (a fixed 28px everywhere) — so the two only matched by coincidence at
 * `md` and up, and the nesting indent shrank to 8px on a phone instead of the
 * same 16px desktop shows. The fix gives the drag handle the same
 * `size-9 md:size-7` box, so the indent is the identical 16px at every width.
 *
 * A group and a plan inside it are seeded directly into IndexedDB — group
 * existence lives in the `sync.industryBuildGroups` setting, membership on
 * the plan's own `buildGroupId` (`buildGroups.ts`).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const GROUP_ID = 'g1';
const GROUP_NAME = 'Test Group';
const PLAN_NAME = 'Grouped Plan';
/** `pl-6` (24px) minus `GroupHeader`'s own `px-2` (8px) — the deliberate nesting indent. */
const EXPECTED_INDENT_PX = 16;

async function seedGroupedPlan(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, groupId, groupName, planName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['settings', 'buildPlans'], 'readwrite');
        tx.objectStore('settings').put({
          key: 'sync.industryBuildGroups',
          value: { [characterId]: [{ id: groupId, name: groupName, order: 0 }] },
        });
        tx.objectStore('buildPlans').put({
          id: 'plan-1',
          characterId,
          name: planName,
          blueprintTypeID: 691,
          runs: 1,
          me: 0,
          te: 0,
          facility: 'npcStation',
          rigLevel: 'none',
          security: 'highsec',
          hubId: 'jita',
          buildGroupId: groupId,
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID, groupId: GROUP_ID, groupName: GROUP_NAME, planName: PLAN_NAME }
  );
}

/** The member row's name minus the group header's own name — the nesting indent, in px. */
async function measureIndent(page: Page): Promise<number> {
  const toggle = page.getByRole('button', { name: `Show or hide the plans in ${GROUP_NAME}` });
  await expect(toggle).toBeVisible();
  await toggle.click();

  const groupNameButton = page.getByRole('button', { name: GROUP_NAME, exact: true });
  const planNameButton = page.getByRole('button', { name: PLAN_NAME, exact: true });
  await expect(planNameButton).toBeVisible();

  const [groupBox, planBox] = await Promise.all([
    groupNameButton.boundingBox(),
    planNameButton.boundingBox(),
  ]);
  expect(groupBox).not.toBeNull();
  expect(planBox).not.toBeNull();
  return planBox!.x - groupBox!.x;
}

test.describe('Build Plan list — group header vs. member name indent', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSelectCharacter(page);
    await seedGroupedPlan(page);
  });

  test('indents the member plan by the deliberate 16px at 390px, not less', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry');
    expect(await measureIndent(page)).toBeCloseTo(EXPECTED_INDENT_PX, 0);
  });

  test('indents the member plan by the same 16px at desktop width, unchanged', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./industry');
    expect(await measureIndent(page)).toBeCloseTo(EXPECTED_INDENT_PX, 0);
  });
});
