import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, SKILL } from './support/fixtureData';

const PLAN_ID = 'e2e-skill-plan-1';
const PLAN_NAME = 'Narrow viewport plan';
const COLUMN_VISIBILITY_KEY = 'planColumnVisibility.v2';
const PLAN_ENTRY = { skillTypeID: SKILL.spaceshipCommand, targetLevel: 1 };

interface SeedEntry {
  skillTypeID: number;
  targetLevel: number;
}

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

async function seedPriorityColumn(page: Page): Promise<void> {
  await putRecord(page, 'settings', {
    key: COLUMN_VISIBILITY_KEY,
    value: { attributePair: true, priority: true, perLevelTime: true, cumulativeTime: true },
  });
}

test('the back-to-plan-list link is a full sm-tier control (36px) at 390px', async ({ page }) => {
  await signInAndGoto(page);
  await seedPlan(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(PHONE);

  const back = page.getByRole('link', { name: 'Back to plans' });
  await expect(back).toBeVisible();

  const height = await back.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(36);
});

test('the header holds Import and Export in one ⋮ menu at 390px, without overflow', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedPlan(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(PHONE);

  await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
  const more = page.getByRole('button', { name: 'More actions' });
  await expect(more).toBeVisible();
  const height = await more.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(36);
  await more.click();
  await expect(page.getByRole('menuitem', { name: 'Export to clipboard' })).toBeVisible();
  await page.keyboard.press('Escape');

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test('the back-to-plan-list link stays absent at and above lg (1280px), where the list is on screen', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedPlan(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(DESKTOP);

  await expect(page.getByPlaceholder('Search skills…')).toBeVisible();

  await expect(page.getByRole('link', { name: 'Back to plans' })).toHaveCount(0);
});

test('the entry priority pill is a full sm-tier tap target (36px) at 390px', async ({ page }) => {
  await signInAndGoto(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await seedPriorityColumn(page);
  await page.setViewportSize(PHONE);
  await page.goto(`./skills/plans/${PLAN_ID}`);

  const pill = page.getByRole('button', { name: /priority, /i });
  await expect(pill).toBeVisible();

  const box = await pill.evaluate((el) => {
    const chip = el.querySelector('span') as HTMLElement;
    return {
      triggerHeight: el.getBoundingClientRect().height,
      chipHeight: chip.getBoundingClientRect().height,
    };
  });
  expect(box.triggerHeight).toBeGreaterThanOrEqual(36);
  expect(box.chipHeight).toBeLessThan(24);
});

test('the entry priority pill keeps its pointer-sized box at and above md (1280px)', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await seedPriorityColumn(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(DESKTOP);

  const pill = page.getByRole('button', { name: /priority, /i });
  await expect(pill).toBeVisible();

  const height = await pill.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(24);
});

test('the Skill injectors panel renders with a priced Large Skill Injector at 390px', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedPlan(page, [{ skillTypeID: SKILL.spaceshipCommand, targetLevel: 4 }]);
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        40520: {
          sell: { min: '700000000', volume: '50', orderCount: '12' },
          buy: { max: '650000000', volume: '30', orderCount: '8' },
        },
      }),
    });
  });
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(PHONE);

  await page.getByRole('button', { name: 'Plan tools' }).click();
  await page.getByRole('button', { name: /^assumptions/i }).click();
  await expect(page.getByRole('heading', { name: 'Skill injectors' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Large Skill Injector' })).toBeVisible();
  await expect(page.locator('.sr-only', { hasText: /^\s*700,000,000\.00 ISK$/ })).toHaveCount(2);
});

test("naming a milestone from an entry row shows it as the header's next milestone", async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await page.setViewportSize(PHONE);
  await page.goto(`./skills/plans/${PLAN_ID}`);

  await page.getByRole('button', { name: 'More actions for Spaceship Command I' }).click();
  await page.getByRole('menuitem', { name: 'Add milestone' }).click();
  const nameDialog = page.getByRole('dialog', { name: 'Name this milestone' });
  await nameDialog.getByRole('textbox').fill('Fly Loki');
  await nameDialog.getByRole('button', { name: 'Save' }).click();
  await expect(nameDialog).toBeHidden();

  await expect(page.getByText('Next milestone')).toBeVisible();
  await expect(page.getByText('Fly Loki').first()).toBeVisible();
});

test('a long milestone name does not overflow the header chip or squeeze the entry row at 390px', async ({
  page,
}) => {
  const longName = 'x'.repeat(60);

  await signInAndGoto(page);
  await seedPlan(page, [{ skillTypeID: SKILL.gallenteDroneSpecialization, targetLevel: 4 }]);
  await page.setViewportSize(PHONE);
  await page.goto(`./skills/plans/${PLAN_ID}`);

  await page
    .getByRole('button', { name: 'More actions for Gallente Drone Specialization IV' })
    .click();
  await page.getByRole('menuitem', { name: 'Add milestone' }).click();
  const nameDialog = page.getByRole('dialog', { name: 'Name this milestone' });
  await nameDialog.getByRole('textbox').fill(longName);
  await nameDialog.getByRole('button', { name: 'Save' }).click();
  await expect(nameDialog).toBeHidden();

  await expect(page.getByText('Next milestone')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const removeButton = page.getByRole('button', {
    name: 'More actions for Gallente Drone Specialization IV',
  });
  await expect(removeButton).toBeVisible();
  const nameLink = page.getByRole('link', { name: 'Gallente Drone Specialization' }).first();
  await expect(nameLink).toBeVisible();
  const nameWidth = await nameLink.evaluate((el) => el.getBoundingClientRect().width);
  expect(nameWidth).toBeGreaterThan(20);
  const numeral = page.locator('li', { has: removeButton }).getByText('IV', { exact: true });
  await expect(numeral).toBeVisible();
  const numeralWidth = await numeral.evaluate((el) => el.getBoundingClientRect().width);
  expect(numeralWidth).toBeGreaterThan(4);
});

test('a long skill name still shows its full level numeral at 390px', async ({ page }) => {
  await signInAndGoto(page);
  await seedPlan(page, [{ skillTypeID: SKILL.gallenteDroneSpecialization, targetLevel: 4 }]);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(PHONE);

  const removeButton = page.getByRole('button', {
    name: 'More actions for Gallente Drone Specialization IV',
  });
  await expect(removeButton).toBeVisible();

  const row = page.locator('li', { has: removeButton });
  const numeral = row.getByText('IV', { exact: true });
  await expect(numeral).toBeVisible();

  const right = await numeral.evaluate((el) => el.getBoundingClientRect().right);
  expect(right).toBeLessThanOrEqual(PHONE.width);

  const prereqPromote = page.getByRole('button', { name: 'Add Drones V to the plan' });
  await expect(prereqPromote).toBeVisible();
  const prereqRow = page.locator('li', { has: prereqPromote });
  await expect(prereqRow.getByText('V', { exact: true })).toBeVisible();
});

test('the header progress chips wrap at 390px without horizontal scroll', async ({ page }) => {
  await signInAndGoto(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await page.setViewportSize(PHONE);
  await page.goto(`./skills/plans/${PLAN_ID}`);

  await expect(page.getByRole('main').locator('span', { hasText: /^Trained$/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a non-Current what-if lens shows a chip in the header strip at 390px', async ({ page }) => {
  await signInAndGoto(page);
  await putRecord(page, 'skillPlans', {
    id: PLAN_ID,
    characterId: CHARACTER_ID,
    name: PLAN_NAME,
    entries: [PLAN_ENTRY],
    remapCount: 0,
    whatIfImplants: { kind: 'preset', preset: '+5' },
    updatedAt: Date.now(),
  });
  await page.setViewportSize(PHONE);
  await page.goto(`./skills/plans/${PLAN_ID}`);

  await expect(page.getByTestId('what-if-chip')).toContainText(
    /^What-if \+5(Saves .+ vs current|Costs .+ vs current|Same as current)$/
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Skills to buy has its own visible row at 390px, without opening Plan tools', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await page.setViewportSize(PHONE);
  await page.goto(`./skills/plans/${PLAN_ID}`);

  const row = page.getByRole('button', { name: /^skills to buy/i });
  await expect(row).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan tools' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  const box = await row.evaluate((el) => el.getBoundingClientRect());
  expect(box.bottom).toBeLessThan(PHONE.height);
  expect(box.height).toBeGreaterThanOrEqual(36);

  await row.click();
  await expect(page.getByRole('button', { name: 'Copy multibuy list' })).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);

  const rowPanelBottom = await row.evaluate((el) => {
    let node: Element | null = el;
    while (node && !node.matches('section')) node = node.parentElement;
    return (node ?? el).getBoundingClientRect().bottom;
  });
  const toolsTop = await page
    .getByRole('button', { name: 'Plan tools' })
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(toolsTop).toBeGreaterThanOrEqual(rowPanelBottom);
});

test('Skills to buy sits under Attributes near the top of the sidebar at 1280px, with Assumptions closed', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedPlan(page, [PLAN_ENTRY]);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(DESKTOP);

  const attributes = page.getByRole('heading', { name: 'Attributes' });
  const skillsToBuy = page.getByRole('heading', { name: 'Skills to buy' });
  const assumptions = page.getByRole('button', { name: /^assumptions/i });
  await expect(skillsToBuy).toBeVisible();
  await expect(assumptions).toHaveAttribute('aria-expanded', 'false');

  const [a, s, m] = await Promise.all(
    [attributes, skillsToBuy, assumptions].map((l) =>
      l.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, scrollTop: window.scrollY };
      })
    )
  );
  expect(s.top).toBeGreaterThan(a.bottom);
  expect(m.top).toBeGreaterThan(s.bottom);
  expect(s.top + s.scrollTop).toBeLessThan(DESKTOP.height);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
