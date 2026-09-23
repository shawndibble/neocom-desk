/**
 * Build Opportunities on a phone (mobile UX pass, issues stemming from
 * #1096's checkbox fix): `DataTable`'s stacked layout hid the sortable
 * column headers entirely (`.dt-stack thead`, `src/styles/index.css`), so a
 * phone pilot had no way to change sort — and its 8-line stacked card had no
 * single number a glance could land on. `MobileOpportunityList` replaces the
 * table below `lg` with a ranked card list: a rank badge, a "hero" metric
 * that tracks whichever field is the active sort, and a real "Sort by" menu.
 * Desktop (`isDesktop`, `lg` and up) keeps the exact `DataTable` it always
 * had — this list never mounts there.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
/** Rifter Blueprint (BPC) — same fixture pair other Industry specs use. */
const BLUEPRINT_TYPE_ID = 691;

/** A second account character, never logged into — only its Dexie rows are seeded, to give one row in the list a genuinely non-comparable owner (issue #1174). */
const SECOND_CHARACTER_ID = 90000002;
const SECOND_CHARACTER_NAME = 'Alt Pilot';

async function seedOwnedBlueprint(page: Page): Promise<void> {
  await page.route(`**/characters/${CHARACTER_ID}/blueprints**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          item_id: 1,
          type_id: BLUEPRINT_TYPE_ID,
          runs: 5,
          material_efficiency: 10,
          time_efficiency: 20,
          quantity: 1,
          location_id: 60003760,
          location_flag: 'Hangar',
        },
      ]),
    })
  );
}

/**
 * A second character record plus its own owned-blueprint cache row, written
 * straight into Dexie rather than driven through a second login — `data.ts`'s
 * `loadCharacterBlueprints` reads cache-first (`esi/cache.ts`), so a fresh
 * row here is served without ever needing a live token for this character.
 * `characters.toArray().length > 1` is also what makes
 * `OpportunitiesPanel`'s Character filter render at all.
 */
async function seedSecondCharacterBlueprint(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, characterName, blueprintTypeID }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['characters', 'esiCache'], 'readwrite');
        tx.objectStore('characters').put({
          characterId,
          name: characterName,
          ownerHash: 'OWNERHASH-ALT',
          addedAt: now,
        });
        tx.objectStore('esiCache').put({
          characterId,
          key: 'blueprints',
          value: [
            {
              item_id: 2,
              type_id: blueprintTypeID,
              runs: 5,
              material_efficiency: 10,
              time_efficiency: 20,
              quantity: 1,
              location_id: 60003760,
              location_flag: 'Hangar',
            },
          ],
          fetchedAt: now,
          truncated: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    {
      characterId: SECOND_CHARACTER_ID,
      characterName: SECOND_CHARACTER_NAME,
      blueprintTypeID: BLUEPRINT_TYPE_ID,
    }
  );
}

test.describe('Opportunities — ranked phone list', () => {
  test.beforeEach(async ({ page }) => {
    await seedOwnedBlueprint(page);
    await signInAndGoto(page);
  });

  test('renders a ranked card list at 390px, not the desktop table', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    await expect(page.getByRole('table', { name: 'Build Opportunities' })).toHaveCount(0);
    await expect(page.getByLabel('Rank 1')).toBeVisible();
    await expect(page.getByText('Rifter', { exact: true })).toBeVisible();
  });

  test('the "Sort by" trigger meets the touch tier at 390px (issue #1174)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const trigger = page.getByRole('button', { name: /Sort by ISK\/hour/ });
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('the selection checkbox is pinned with a real ~44px target', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const checkbox = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkbox).toBeVisible();

    const wrapper = checkbox.locator('xpath=..');
    const position = await wrapper.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('absolute');

    const box = await wrapper.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('changing the sort changes which metric leads the card', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    await expect(page.getByRole('button', { name: /Sort by ISK\/hour/ })).toBeVisible();

    await page.getByRole('button', { name: /Sort by ISK\/hour/ }).click();
    await page.getByRole('menuitem', { name: 'Margin', exact: true }).click();

    await expect(page.getByRole('button', { name: /Sort by Margin/ })).toBeVisible();
    // The hero number's own unit label now reads "Margin", not "ISK/hour".
    await expect(page.getByText('ISK/hour', { exact: true })).toHaveCount(0);
  });

  test('a long product name wraps instead of truncating', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const name = page.getByText('Rifter', { exact: true });
    const overflowWrap = await name.evaluate((el) => getComputedStyle(el).overflowWrap);
    const textOverflow = await name.evaluate((el) => getComputedStyle(el).textOverflow);
    expect(overflowWrap).toBe('break-word');
    expect(textOverflow).not.toBe('ellipsis');
  });

  test('desktop keeps the ordinary table, unchanged, with no sort menu', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./industry/opportunities');

    await expect(page.getByRole('table', { name: 'Build Opportunities' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sort by/ })).toHaveCount(0);

    const checkbox = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkbox).toBeVisible();
    const box = await checkbox.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(16, 0);
    expect(box!.height).toBeCloseTo(16, 0);
  });

  /**
   * `hasTouch` scoped to this block, not the file — same reasoning
   * `charactersToolbarNarrow.spec.ts`'s own touch-and-hold block gives.
   *
   * Previously (issue #1174) this row's checkbox was disabled with a
   * tooltip explaining that only the active character's own blueprints
   * could be added to Compare — because the seeded plan used to be stamped
   * with the alt's own id, which no surface reading Build Plans could ever
   * find. Issue #1061 fixed the stamping (seeded plans now belong to the
   * active character), so the row is selectable like any other.
   */
  test.describe("another character's row is selectable on touch (issue #1061)", () => {
    test.use({ hasTouch: true });

    test('a tap toggles the checkbox, with no disabled state or tooltip', async ({ page }) => {
      await seedSecondCharacterBlueprint(page);
      await page.setViewportSize(PHONE);
      await page.goto('./industry/opportunities');

      // Wait for Opportunities' own data (and with it its Character filter
      // trigger) to have mounted before touching "This character" — Active
      // Jobs renders an independent filter control of its own higher up the
      // page, and `.last()` below only reliably means "Opportunities' own"
      // once this panel has actually finished its first render.
      await expect(page.getByRole('button', { name: /Sort by/ })).toBeVisible();

      // The Character filter defaults to "This character" — switch to "All
      // characters" so the alt's row joins the list.
      await page.getByText('This character').last().click();
      await page.getByRole('button', { name: 'All characters' }).click();

      const altRow = page.locator('li', { hasText: SECOND_CHARACTER_NAME });
      await expect(altRow).toBeVisible();
      const checkbox = altRow.getByRole('checkbox');
      await expect(checkbox).toBeVisible();
      await expect(checkbox).not.toHaveAttribute('title');
      await expect(checkbox).not.toHaveAttribute('aria-disabled');
      expect(await checkbox.evaluate((el) => (el as HTMLInputElement).disabled)).toBe(false);
      await expect(page.getByRole('tooltip')).toHaveCount(0);

      await checkbox.tap();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      expect(await checkbox.isChecked()).toBe(true);
    });
  });
});
