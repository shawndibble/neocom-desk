/**
 * Skill Plan editor's narrow-viewport tap targets.
 *
 * Back-to-plan-list link (issue #1095): below `lg` the
 * plan list is not on screen at all, so this link is the only way back to
 * it — and it was a bare `inline-block text-xs text-accent hover:underline`
 * anchor, a ~16px-tall tap target on exactly the viewport where it matters
 * most.
 *
 * Asserted on the rendered bounding box rather than the class string; see
 * `loyaltyStoreNarrow.spec.ts` for why.
 *
 * The plan is seeded straight into IndexedDB rather than created through the
 * "New plan" flow — same raw-`indexedDB` precedent as
 * `industryRecordsNarrow.spec.ts`, run after `loginAndSelectCharacter` so the
 * app's Dexie schema has already opened the stores.
 *
 * Priority pill (issue #1106): the pill is a per-entry control on the mobile
 * meta line, and was a bare `px-1` button around 11px text. The priority
 * column is off by default (`columnPreference.ts`), so the run seeds both the
 * plan entry and that preference — same raw-`indexedDB` route as the plan
 * itself, into the `settings` store `useLocalSetting` reads.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID, SKILL } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const PLAN_ID = 'e2e-skill-plan-1';
const PLAN_NAME = 'Narrow viewport plan';
/** Mirrors `COLUMN_VISIBILITY_SETTING_KEY` in `columnPreference.ts`. */
const COLUMN_VISIBILITY_KEY = 'planColumnVisibility.v2';
/** Untrained in the fixture, and its own prereq chain is empty, so one entry stays one row. */
const PLAN_ENTRY = { skillTypeID: SKILL.spaceshipCommand, targetLevel: 1 };

interface SeedEntry {
  skillTypeID: number;
  targetLevel: number;
}

/** One record straight into a Dexie store — both seeds below are one `put`. */
async function putRecord(
  page: Page,
  store: string,
  record: Record<string, unknown>
): Promise<void> {
  await page.evaluate(
    async ({ store: storeName, record: value }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction([storeName], 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { store, record }
  );
}

async function seedPlan(page: Page, entries: SeedEntry[] = []): Promise<void> {
  await putRecord(page, 'skillPlans', {
    id: PLAN_ID,
    characterId: CHARACTER_ID,
    name: PLAN_NAME,
    entries,
    remapCount: 0,
    updatedAt: Date.now(),
  });
}

/**
 * Turn the priority column on. It is off by default — an editing control, not
 * a readout — so without this the pill never renders.
 */
async function seedPriorityColumn(page: Page): Promise<void> {
  await putRecord(page, 'settings', {
    key: COLUMN_VISIBILITY_KEY,
    value: { attributePair: true, priority: true, perLevelTime: true, cumulativeTime: true },
  });
}

test('the back-to-plan-list link is a full sm-tier control (36px) at 390px', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await seedPlan(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(PHONE);

  const back = page.getByRole('link', { name: 'Back to plans' });
  await expect(back).toBeVisible();

  const height = await back.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(36);
});

test('the back-to-plan-list link stays absent at and above lg (1280px), where the list is on screen', async ({
  page,
}) => {
  await loginAndSelectCharacter(page);
  await seedPlan(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(DESKTOP);

  // Anchor on the editor having actually rendered before asserting an
  // absence: `toHaveCount(0)` alone also passes on the loading spinner, or on
  // the `<Navigate to="/skills/plans">` the route falls back to if the seeded
  // plan never landed — neither of which says anything about the gate.
  await expect(page.getByPlaceholder('Search skills…')).toBeVisible();

  // Gated on `!isDesktop`: the plan list itself is in the sidebar here, so
  // there is no box to size — pinned so the restyling above cannot quietly
  // start rendering a second route back to a list already in view.
  await expect(page.getByRole('link', { name: 'Back to plans' })).toHaveCount(0);
});

test('the entry priority pill is a full sm-tier tap target (36px) at 390px', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await seedPriorityColumn(page);
  // Sized before the first paint, unlike the back-link tests above: the pill
  // renders in *both* layouts, so `toBeVisible` would also pass on the desktop
  // row this project's 1280px default viewport would draw first, and the
  // one-shot `evaluate` below would measure that row.
  await page.setViewportSize(PHONE);
  await page.goto(`./skills/plans/${PLAN_ID}`);

  const pill = page.getByRole('button', { name: /^Priority for / });
  await expect(pill).toBeVisible();

  const box = await pill.evaluate((el) => {
    const chip = el.querySelector('span') as HTMLElement;
    return {
      triggerHeight: el.getBoundingClientRect().height,
      chipHeight: chip.getBoundingClientRect().height,
    };
  });
  expect(box.triggerHeight).toBeGreaterThanOrEqual(36);
  // The visible chip stays the size of the attribute badge beside it — only
  // the hit area around it grew.
  expect(box.chipHeight).toBeLessThan(24);
});

test('the entry priority pill keeps its pointer-sized box at and above md (1280px)', async ({
  page,
}) => {
  await loginAndSelectCharacter(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await seedPriorityColumn(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(DESKTOP);

  const pill = page.getByRole('button', { name: /^Priority for / });
  await expect(pill).toBeVisible();

  // The desktop row lays the pill out inline beside `sm`-tier controls, so a
  // touch-tier box here would push that row's height out.
  const height = await pill.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(24);
});
