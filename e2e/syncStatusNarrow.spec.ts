/**
 * A failing sync has to be visible on a phone (issue #1132) — see
 * `Layout.tsx`'s `SyncErrorBanner` for why the note lives in the shell.
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
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import type { SyncStatus } from '../src/sync/status';

type Viewport = { width: number; height: number };

const PHONE: Viewport = { width: 390, height: 844 };
const DESKTOP: Viewport = { width: 1280, height: 800 };
const ERROR_NOTE = 'Sync error — changes saved locally';

test.beforeEach(async ({ page }) => {
  await signInAndGoto(page);
});

/**
 * Waits on the route's own `<h1>`: `page.goto` resolves on `load`, which in
 * this SPA lands before React paints, so a count assertion made any earlier
 * would pass against an empty shell.
 */
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
    // Indirected through a variable so `tsc` leaves it alone: this is a dev
    // server URL, not a path this spec's own module graph can resolve. The
    // cast is still checked against the real `SyncStatus`, so a signature
    // change here fails typecheck rather than at runtime in CI.
    const specifier = '/src/sync/status.ts';
    const status = (await import(specifier)) as {
      setStatus: (characterId: number, patch: Partial<SyncStatus>) => void;
    };
    status.setStatus(characterId, { state: 'error', error: 'forced by e2e' });
  }, CHARACTER_ID);
}

test('a sync error is visible at 390px from a route outside /skills/plans', async ({ page }) => {
  await openRoute(page, './settings', 'Settings');

  // The note is absent while sync is healthy — otherwise the assertion below
  // would pass on a note that was always there.
  await expect(page.getByText(ERROR_NOTE)).toHaveCount(0);

  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();
});

test('the shell note follows the pilot across routes at 390px', async ({ page }) => {
  await openRoute(page, './settings', 'Settings');
  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();

  // A client-side route change keeps the module state, so the note should
  // simply still be there — the point of mounting it in the shell. `/overview`
  // is in `DEFAULT_MOBILE_TABS`, so the link is in the phone's tab bar.
  await page.getByRole('link', { name: 'Overview' }).first().click();
  await page.waitForURL(/\/overview$/);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();
});

test('/skills/plans shows exactly one note, not the shell note plus its own', async ({ page }) => {
  await openRoute(page, './skills/plans', 'Skills');
  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toHaveCount(1);
});

test('the note is kept at desktop width, where /skills/plans already had it', async ({ page }) => {
  await openRoute(page, './settings', 'Settings', DESKTOP);
  await forceSyncError(page);
  await expect(page.getByText(ERROR_NOTE)).toBeVisible();
});
