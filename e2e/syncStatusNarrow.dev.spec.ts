import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import type { SyncStatus } from '../src/sync/status';

type Viewport = { width: number; height: number };

const ERROR_NOTE = 'Sync error — changes saved locally';

test.beforeEach(async ({ page }) => {
  await signInAndGoto(page);
});

async function openRoute(
  page: Page,
  path: string,
  heading: string,
  viewport: Viewport = PHONE
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}

async function forceSyncError(page: Page): Promise<void> {
  await page.evaluate(async (characterId) => {
    const specifier = '/src/sync/status.ts';
    const status = (await import(specifier)) as {
      setStatus: (characterId: number, patch: Partial<SyncStatus>) => void;
    };
    status.setStatus(characterId, { state: 'error', error: 'forced by e2e' });
  }, CHARACTER_ID);
}

test('a sync error is visible at 390px from a route outside /skills/plans', async ({ page }) => {
  await openRoute(page, './settings', 'Settings');

  await expect(page.locator('p', { hasText: ERROR_NOTE })).toHaveCount(0);

  await forceSyncError(page);
  await expect(page.locator('p', { hasText: ERROR_NOTE })).toBeVisible();
});

test('the shell note follows the pilot across routes at 390px', async ({ page }) => {
  await openRoute(page, './settings', 'Settings');
  await forceSyncError(page);
  await expect(page.locator('p', { hasText: ERROR_NOTE })).toBeVisible();

  await page.getByRole('link', { name: 'Overview' }).first().click();
  await page.waitForURL(/\/overview$/);
  await expect(page.locator('p', { hasText: ERROR_NOTE })).toBeVisible();
});

test('/skills/plans shows exactly one note, not the shell note plus its own', async ({ page }) => {
  await openRoute(page, './skills/plans', 'Skills');
  await forceSyncError(page);
  await expect(page.locator('p', { hasText: ERROR_NOTE })).toHaveCount(1);
});

test('the note is kept at desktop width, where /skills/plans already had it', async ({ page }) => {
  await openRoute(page, './settings', 'Settings', DESKTOP);
  await forceSyncError(page);
  await expect(page.locator('p', { hasText: ERROR_NOTE })).toBeVisible();
});
