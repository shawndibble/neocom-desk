/**
 * Build Opportunities on a phone (mobile UX pass, issues stemming from
 * #1096's checkbox fix): `DataTable`'s stacked layout hid the sortable
 * column headers entirely (`.dt-stack thead`, `src/styles/index.css`), so a
 * phone pilot had no way to change sort — and its 8-line stacked card had no
 * single number a glance could land on. `MobileOpportunityList` replaces the
 * table below `lg` with a card list: a leading selection checkbox, a "hero"
 * metric that tracks whichever field is the active sort, and a real "Sort by"
 * menu. The panel's title is a view picker there ("Ranked builds" / "Owned
 * blueprints"), and "All owned" gets its own card list too.
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
    await expect(page.getByText('Rifter', { exact: true })).toBeVisible();
    // The view picker stands in for the title, on the same line as the actions.
    const picker = page.getByRole('combobox', { name: 'View' });
    await expect(picker).toHaveText(/Ranked builds/);
  });

  for (const width of [390, 360]) {
    test(`the header controls do not overlap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('./industry/opportunities');

      const picker = page.getByRole('combobox', { name: 'View' });
      const stock = page.getByRole('combobox', { name: 'Use my stock' });
      await expect(picker).toBeVisible();
      await expect(stock).toBeVisible();
      const header = picker.locator('xpath=ancestor::header');
      const controls = header.locator('button, [role="combobox"]');
      await expect.poll(() => controls.count()).toBeGreaterThan(1);
      const boxes = [];
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        if (box) boxes.push(box);
      }
      for (const [i, a] of boxes.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x + a.width).toBeLessThanOrEqual(width);
        for (const b of boxes.slice(i + 1)) {
          const apart =
            a.x + a.width <= b.x + 0.5 ||
            b.x + b.width <= a.x + 0.5 ||
            a.y + a.height <= b.y + 0.5 ||
            b.y + b.height <= a.y + 0.5;
          expect(apart).toBe(true);
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      ).toBe(true);
    });
  }

  test("the What's profitable filter sheet shows Apply without scrolling at 390x844", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const panel = page.locator('section', {
      has: page.getByRole('heading', { name: "What's profitable" }),
    });
    await panel.getByRole('button', { name: /^Filters/ }).click();
    const apply = page.getByRole('dialog').getByRole('button', { name: 'Apply' });
    await expect(apply).toBeVisible();
    await expect
      .poll(async () => {
        const box = await apply.boundingBox();
        return box ? box.y + box.height : Infinity;
      })
      .toBeLessThanOrEqual(PHONE.height);
  });

  test('the phone "Use my stock" select opens and picks a value', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const stock = page.getByRole('combobox', { name: 'Use my stock' });
    await stock.click();
    await page.getByRole('option', { name: /full/i }).click();
    await expect(stock).toHaveText(/full/i);
  });

  test('the "Sort by" trigger meets the touch tier at 390px (issue #1174)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const trigger = page.getByRole('button', { name: /Sort by ISK\/hour/ });
    await expect(trigger).toBeVisible();
    // Polled, not read once: the list re-renders as the ranking lands, and a
    // trigger remounted between the visibility check and the measurement
    // reads as a null box — a CI-only flake, not a short target.
    await expect
      .poll(async () => (await trigger.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  });

  test('the selection checkbox leads the card with a real ~44px target', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const checkbox = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkbox).toBeVisible();

    const wrapper = checkbox.locator('xpath=..');
    const name = page.getByText('Rifter', { exact: true });
    await expect
      .poll(async () => {
        const [box, nameBox] = [await wrapper.boundingBox(), await name.boundingBox()];
        return box && nameBox ? box.x < nameBox.x : false;
      })
      .toBe(true);

    // Polled for the same remount race as the Sort by trigger above.
    await expect
      .poll(async () => {
        const box = await wrapper.boundingBox();
        return Math.min(box?.width ?? 0, box?.height ?? 0);
      })
      .toBeGreaterThanOrEqual(44);
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
    await expect
      .poll(async () => {
        const box = await checkbox.boundingBox();
        return box && [Math.round(box.width), Math.round(box.height)];
      })
      .toEqual([16, 16]);
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
      // characters" so the alt's row joins the list. Below `md` the trigger
      // is icon-only, so it's found by its `aria-label`, not its (absent)
      // visible text.
      await page.getByRole('button', { name: 'This character' }).last().click();
      await page.getByRole('menuitemradio', { name: 'All characters' }).click();

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

  /**
   * Issue #1781: the card's own face stays uncrowded. Tapping the card (its
   * name included) is Start plan; the ⋯ menu keeps price history only.
   */
  test('tapping the product name opens the plan, not the Market page', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    // Wait for the card to be fully rendered (its controls mounted) before tapping.
    await expect(page.getByRole('checkbox', { name: /Select Rifter/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /More actions for Rifter/ })).toBeVisible();
    await page.getByText('Rifter', { exact: true }).click();

    await expect(page).toHaveURL(/\/industry\/plans\/[^/]+$/);
  });
  test('identical copies share one card; a different ME keeps its own', async ({ page }) => {
    const copy = {
      type_id: BLUEPRINT_TYPE_ID,
      runs: 5,
      material_efficiency: 10,
      time_efficiency: 20,
      quantity: -2,
      location_id: 60003760,
      location_flag: 'Hangar',
    };
    await page.route(`**/characters/${CHARACTER_ID}/blueprints**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ...copy, item_id: 1 },
          { ...copy, item_id: 2 },
          { ...copy, item_id: 3, material_efficiency: 4 },
        ]),
      })
    );
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    await expect(page.getByRole('checkbox', { name: /Select Rifter/ })).toHaveCount(2);
    await expect(page.getByText('2 copies', { exact: true })).toBeVisible();
  });

  test('ticking two cards brings up the Compare bar; Clear dismisses it', async ({ page }) => {
    const copy = {
      type_id: BLUEPRINT_TYPE_ID,
      runs: 5,
      time_efficiency: 20,
      quantity: -2,
      location_id: 60003760,
      location_flag: 'Hangar',
    };
    await page.route(`**/characters/${CHARACTER_ID}/blueprints**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ...copy, item_id: 1, material_efficiency: 10 },
          { ...copy, item_id: 2, material_efficiency: 4 },
        ]),
      })
    );
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    const checkboxes = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkboxes).toHaveCount(2);
    const bar = page.getByRole('region', { name: 'Compare selected blueprints' });
    await checkboxes.nth(0).check();
    await expect(bar).toHaveCount(0);
    await checkboxes.nth(1).check();
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('2 selected');
    await bar.getByRole('button', { name: 'Clear' }).click();
    await expect(bar).toHaveCount(0);
  });

  test('the card menu holds price history, not a duplicate plan or market link', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    await page.getByRole('button', { name: /More actions for Rifter/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Price history' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'View in Market' })).toHaveCount(0);
  });

  test('"Owned blueprints" lists cards, not the stacked table', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/opportunities');

    await page.getByRole('combobox', { name: 'View' }).click();
    await page.getByRole('option', { name: 'Owned blueprints' }).click();

    const list = page.getByRole('list', { name: 'Owned Blueprints' });
    await expect(list).toBeVisible();
    await expect(list.getByText('Rifter', { exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start a plan for Rifter' })).toBeVisible();
  });
});
