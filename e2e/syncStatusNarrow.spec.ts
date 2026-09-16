/**
 * Sync failure has to be visible on a phone (issue #1132). The only signal the
 * app had was `SyncStatusDot`, whose state lives in a `title=` tooltip and
 * which is mounted inside the desktop-only left rail — so below `md` nothing
 * reported a failing sync at all, except on `/skills/plans`, the single route
 * that mounted `SyncErrorNote` for itself. The fix moves that note to the
 * shell (`Layout.tsx`), where it speaks from every route.
 *
 * Forcing the state: `sync/planSync.ts` is the only writer of an `error`
 * status, and it never runs here — E2E deliberately blanks the Firebase env
 * (see playwright.config.ts) so `isSyncConfigured()` is false and no sync is
 * ever attempted. The status store itself (`sync/status.ts`) is Firebase-free
 * and synchronous, though, so the spec imports the very module instance the
 * app is already subscribed to off the dev server and calls `setStatus`
 * directly. `useSyncStatus` filters on the active character, so the status
 * must be stamped with `CHARACTER_ID` or it is dropped.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const ERROR_NOTE = 'Sync error — changes saved locally';

/** Must run after the app has mounted: a navigation resets the module state. */
async function forceSyncError(page: Page): Promise<void> {
  await page.evaluate(async (characterId) => {
    // Indirected through a variable so `tsc` leaves it alone: this is a dev
    // server URL, not a path this spec's own module graph can resolve.
    const specifier = '/src/sync/status.ts';
    const status = (await import(specifier)) as {
      setStatus: (characterId: number, patch: { state: string; error: string }) => void;
    };
    status.setStatus(characterId, { state: 'error', error: 'forced by e2e' });
  }, CHARACTER_ID);
}

test('a sync error is visible at 390px from a route outside /skills/plans', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.setViewportSize(PHONE);
  await page.goto('./settings');

  // The note is absent while sync is healthy — otherwise the assertion below
  // would pass on a note that was always there.
  await expect(page.getByText(ERROR_NOTE)).toHaveCount(0);

  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();
});

test('the shell note follows the pilot across routes at 390px', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.setViewportSize(PHONE);
  await page.goto('./settings');
  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();

  // A client-side route change keeps the module state, so the note should
  // simply still be there — the point of mounting it in the shell.
  await page.getByRole('link', { name: 'Overview' }).first().click();
  await page.waitForURL(/\/$|\/overview/);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();
});

test('/skills/plans shows exactly one note, not the shell note plus its own', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.setViewportSize(PHONE);
  await page.goto('./skills/plans');
  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toHaveCount(1);
});

test('the note is kept at desktop width, where /skills/plans already had it', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('./settings');
  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();
});
