/**
 * Trained-skills page's per-group tile touch target (issue #1071, now the
 * group board of #3643): the tile is a content-sized card that never drops
 * below the 36px touch floor.
 *
 * Uses the default seeded character (no route/Dexie overrides needed):
 * `skills.spec.ts` already proves "Spaceship Command" renders as a trained
 * group from the default fixtures, so it's reused here as a group known to
 * exist without guessing at fixture data.
 */
import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, SKILL } from './support/fixtureData';

async function gotoTrainedSkills(page: Page) {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Trained' }).click();
  await page.waitForURL(/\/skills\/trained$/);
}

test('skill-group tile meets the 36px touch floor at 390px, and still expands/collapses', async ({
  page,
}) => {
  await gotoTrainedSkills(page);
  await page.setViewportSize(PHONE);

  const header = page.getByRole('heading', { name: /^Spaceship Command/ }).getByRole('button');
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute('aria-expanded', 'false');

  const collapsedHeight = await header.evaluate((el) => el.getBoundingClientRect().height);
  expect(collapsedHeight).toBeGreaterThanOrEqual(36);

  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();

  const expandedHeight = await header.evaluate((el) => el.getBoundingClientRect().height);
  expect(expandedHeight).toBeGreaterThanOrEqual(36);

  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
});

/**
 * The trained-skill rows under each header (#1468): a single `py-1.5 text-xs`
 * line landed at 28px on a phone while the header above it reached 36px.
 * `tappableRowClassName` pins the touch tier below `md` and falls back to
 * that same 28px above it.
 */
async function caldariFrigateRow(page: Page) {
  await page
    .getByRole('heading', { name: /^Spaceship Command/ })
    .getByRole('button')
    .click();
  const row = page.getByRole('button', { name: /^Caldari Frigate/ });
  await expect(row).toBeVisible();
  return row;
}

test('trained-skill row meets the 36px touch floor at 390px, and opens the skill info', async ({
  page,
}) => {
  // The skill info's price section reads the order book on open.
  await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await gotoTrainedSkills(page);
  await page.setViewportSize(PHONE);

  const row = await caldariFrigateRow(page);
  const height = await row.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(36);

  await row.click();
  await expect(page.getByRole('dialog', { name: 'Caldari Frigate' })).toBeVisible();
});

test('trained-skill row keeps its 28px pointer height at and above md (1280px)', async ({
  page,
}) => {
  await gotoTrainedSkills(page);
  await page.setViewportSize(DESKTOP);

  const row = await caldariFrigateRow(page);
  const height = await row.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeCloseTo(28, 0);
});

/**
 * The skill in the live queue's training slot carries a "Training → IV · 4d 4h"
 * chip on its Trained row (#1724). The queue is seeded by a `page.route`
 * override registered before sign-in — the boot prefetch caches whatever it
 * first sees (see planQueueImport.spec.ts).
 */
test('the in-progress skill shows a Training chip at 390px, and no other row does', async ({
  page,
}) => {
  const day = 86_400_000;
  await page.route(`**/characters/${CHARACTER_ID}/skillqueue`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          skill_id: SKILL.smallHybridTurret,
          finished_level: 4,
          queue_position: 0,
          start_date: new Date(Date.now() - day).toISOString(),
          finish_date: new Date(Date.now() + 4 * day + 4 * 3_600_000 + 60_000).toISOString(),
        },
      ]),
    })
  );
  await gotoTrainedSkills(page);
  await page.setViewportSize(PHONE);

  await page.getByRole('button', { name: /^Gunnery/ }).click();
  const chip = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /^Small Hybrid Turret/ }) })
    .getByText(/^Training → IV · 4d 4h$/);
  await expect(chip).toBeVisible();
  // One on the row, one on its group's header (#2002); no other row has one.
  await expect(page.getByText(/^Training →/)).toHaveCount(2);

  const box = await chip.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
});

/**
 * Below `sm` the training row's name and chip share a column: the chip drops
 * under the name instead of squeezing it to "Adva…" (#2004).
 */
async function seedTrainingAdvancedIndustrial(page: Page) {
  const day = 86_400_000;
  await page.route(`**/characters/${CHARACTER_ID}/skills`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        skills: [
          {
            skill_id: 3396,
            trained_skill_level: 4,
            active_skill_level: 4,
            skillpoints_in_skill: 45_255_000,
          },
          {
            skill_id: 62451,
            trained_skill_level: 1,
            active_skill_level: 1,
            skillpoints_in_skill: 1_280_000,
          },
          {
            skill_id: 25718,
            trained_skill_level: 1,
            active_skill_level: 1,
            skillpoints_in_skill: 1_000,
          },
        ],
        total_sp: 46_536_000,
        unallocated_sp: 0,
      }),
    })
  );
  await page.route(`**/characters/${CHARACTER_ID}/skillqueue`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          skill_id: 3396,
          finished_level: 5,
          queue_position: 0,
          start_date: new Date(Date.now() - day).toISOString(),
          finish_date: new Date(Date.now() + day + 3_600_000 + 60_000).toISOString(),
        },
      ]),
    })
  );
}

async function openTrainingRow(page: Page, size: { width: number; height: number }) {
  await seedTrainingAdvancedIndustrial(page);
  await gotoTrainedSkills(page);
  await page.setViewportSize(size);
  await page.getByRole('button', { name: /^Production/ }).click();
  const button = page.getByRole('button', { name: /^Advanced Industrial Ship Construction/ });
  await expect(button).toBeVisible();
  const row = page.getByRole('listitem').filter({ has: button });
  const name = row.getByRole('link', { name: 'Advanced Industrial Ship Construction' });
  const chip = row.getByText(/^Training →/);
  await expect(chip).toBeVisible();
  return { row, button, name, chip };
}

test('the training row shows its full name with the chip under it at 390px', async ({ page }) => {
  const { row, name, chip } = await openTrainingRow(page, PHONE);

  const fits = await name.evaluate((el) => el.scrollHeight <= el.clientHeight);
  expect(fits).toBe(true);

  const rowBox = (await row.boundingBox())!;
  const nameBox = (await name.boundingBox())!;
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  expect(rowBox.height).toBeGreaterThanOrEqual(36);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
  expect(overflow).toBe(true);
});

test('a 40-character skill name wraps to at most two lines at 390px', async ({ page }) => {
  await seedTrainingAdvancedIndustrial(page);
  await gotoTrainedSkills(page);
  await page.setViewportSize(PHONE);
  await page.getByRole('button', { name: /^Resource Processing/ }).click();
  const row = page.getByRole('listitem').filter({
    has: page.getByRole('button', { name: /^Capital Shipboard Compression Technology/ }),
  });
  const name = row.getByRole('link', { name: 'Capital Shipboard Compression Technology' });
  await expect(name).toBeVisible();

  const fits = await name.evaluate((el) => el.scrollHeight <= el.clientHeight);
  expect(fits).toBe(true);
  const box = (await row.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(36);
});

for (const size of [
  { width: 1280, height: 800 },
  { width: 768, height: 800 },
]) {
  test(`the training row keeps a one-line name with the chip beside it at ${size.width}px`, async ({
    page,
  }) => {
    const { name, chip } = await openTrainingRow(page, size);
    const nameBox = (await name.boundingBox())!;
    const chipBox = (await chip.boundingBox())!;
    expect(chipBox.y).toBeLessThan(nameBox.y + nameBox.height);
    expect(nameBox.height).toBeLessThan(20);
  });
}
