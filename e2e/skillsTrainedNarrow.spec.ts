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

  const header = page.getByRole('button', { name: /Spaceship Command/ });
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

  const header = page.getByRole('button', { name: /Spaceship Command/ });
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
  await page.getByRole('button', { name: /Spaceship Command/ }).click();
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
