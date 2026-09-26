/**
 * Trained-skills page's per-group disclosure header touch target (issue
 * #1071): the header shared `min-h-8` (32px) with `Disclosure.tsx`, the
 * shared disclosure primitive it duplicates instead of reusing — neither
 * ever reached the 44px touch floor on a phone. Fixed on both with
 * `min-h-11 ... md:min-h-0`, the same precedent as #1064's Open Orders
 * disclosure row.
 *
 * Uses the default seeded character (no route/Dexie overrides needed):
 * `skills.spec.ts` already proves "Spaceship Command" renders as a trained
 * group from the default fixtures, so it's reused here as a group known to
 * exist without guessing at fixture data.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, SKILL } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoTrainedSkills(page: Page) {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('link', { name: 'Trained' }).click();
  await page.waitForURL(/\/skills\/trained$/);
}

test('skill-group disclosure header meets the 44px touch floor at 390px, and still expands/collapses', async ({
  page,
}) => {
  await gotoTrainedSkills(page);
  await page.setViewportSize(PHONE);

  const header = page.getByRole('button', { name: /^Spaceship Command/ });
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute('aria-expanded', 'false');

  const collapsedHeight = await header.evaluate((el) => el.getBoundingClientRect().height);
  expect(collapsedHeight).toBeGreaterThanOrEqual(44);

  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();

  const expandedHeight = await header.evaluate((el) => el.getBoundingClientRect().height);
  expect(expandedHeight).toBeGreaterThanOrEqual(44);

  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
});

test('skill-group disclosure header drops the touch-tier floor at and above md (1280px), staying content-driven', async ({
  page,
}) => {
  await gotoTrainedSkills(page);
  await page.setViewportSize(DESKTOP);

  const header = page.getByRole('button', { name: /^Spaceship Command/ });
  await expect(header).toBeVisible();

  const height = await header.evaluate((el) => el.getBoundingClientRect().height);
  // `md:min-h-0` removes the floor rather than pinning back to the old
  // fixed 32px — pinned to the real measured content-driven height, not
  // just "< 44", so a loose upper bound can't miss a partial regression
  // back toward the touch-tier height.
  expect(height).toBeGreaterThanOrEqual(24);
  expect(height).toBeLessThanOrEqual(36);
});

/**
 * The trained-skill rows under each header (#1468): a single `py-1.5 text-xs`
 * line landed at 28px on a phone while the header above it reached 44px.
 * `tappableRowClassName` pins the touch tier below `md` and falls back to
 * that same 28px above it.
 */
async function caldariFrigateRow(page: Page) {
  await page.getByRole('button', { name: /^Spaceship Command/ }).click();
  const row = page.getByRole('button', { name: /^Caldari Frigate/ });
  await expect(row).toBeVisible();
  return row;
}

test('trained-skill row meets the 44px touch floor at 390px, and still selects', async ({
  page,
}) => {
  await gotoTrainedSkills(page);
  await page.setViewportSize(PHONE);

  const row = await caldariFrigateRow(page);
  const height = await row.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);

  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
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
 * The inspector renders above the sticky search bar, i.e. above the row that
 * opened it — with no scroll-into-view, selecting a row scrolled below the
 * top of the page left the inspector rendered entirely off-screen (#1712).
 *
 * Scrolls to the bottom before clicking: clicking a row that's already
 * on-screen leaves the page scrolled little enough that the inspector can
 * land in view by coincidence, proving nothing about the fix under test.
 */
async function assertInspectorScrollsIntoView(page: Page) {
  const row = await caldariFrigateRow(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await row.click();

  const inspector = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Caldari Frigate' }),
  });
  const inspectorClose = inspector.getByRole('button', { name: 'Close' });
  await expect(inspectorClose).toBeInViewport();
  // In-viewport alone doesn't rule out the sticky search bar painting over
  // it — a real click only succeeds if the button actually receives it.
  await inspectorClose.click();
  await expect(row).toHaveAttribute('aria-pressed', 'false');
}

test('selecting a trained skill scrolls its inspector into view at 390px', async ({ page }) => {
  await gotoTrainedSkills(page);
  await page.setViewportSize(PHONE);
  await assertInspectorScrollsIntoView(page);
});

test('selecting a trained skill scrolls its inspector into view at 1280px', async ({ page }) => {
  await gotoTrainedSkills(page);
  await page.setViewportSize(DESKTOP);
  await assertInspectorScrollsIntoView(page);
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
  const chip = page.getByText(/^Training → IV · 4d 4h$/);
  await expect(chip).toBeVisible();
  await expect(page.getByText(/^Training →/)).toHaveCount(1);

  const box = await chip.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
});
