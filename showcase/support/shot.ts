/**
 * One screenshot: go there, let the route's own data settle, capture.
 *
 * `networkidle` is not available to us (the app is deliberately cut off from
 * every external host), so settling is a visible-content assertion plus a
 * short beat for the Dexie reads each panel fires on mount.
 */
import { expect, type Page } from '@playwright/test';

export const OUT_DIR = process.env.SHOWCASE_OUT ?? 'showcase-out';

export interface ShotOptions {
  /** Something the page only renders once its data has loaded. */
  settleOn?: string;
  /** Viewport-only capture — for modals, which are already full-bleed. */
  viewportOnly?: boolean;
  /** Extra beat for the heavier boards. */
  settleMs?: number;
}

/**
 * Hides the sync dot's *error* state only.
 *
 * It is a harness artifact, not a product state: `isSyncConfigured()` has to
 * be true for the public-contract panels to render at all, and this run then
 * blocks every Firebase host, so the boot `triggerSync` always fails. A real
 * user with sync configured sees the green idle dot here.
 */
const HIDE_HARNESS_SYNC_ERROR = `span[role='status'].bg-danger { visibility: hidden !important; }`;

export async function goTo(page: Page, path: string, options: ShotOptions = {}): Promise<void> {
  await page.goto(`.${path}`);
  await page.addStyleTag({ content: HIDE_HARNESS_SYNC_ERROR });
  await dismissWhatsNew(page);
  if (options.settleOn) {
    await expect(page.getByText(options.settleOn, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
  }
  await page.waitForTimeout(options.settleMs ?? 1_200);
}

/**
 * Clicks through the What's New dialog if it ever appears.
 *
 * The fixture already avoids it — the app bootstraps a device with no
 * recorded version silently, so seeding no `whatsNew.lastSeenVersion` keeps
 * it shut. This is the belt to that's braces: the dialog is modal and would
 * sit over the middle of every screenshot behind it.
 */
async function dismissWhatsNew(page: Page): Promise<void> {
  const gotIt = page.getByRole('button', { name: /got it/i });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click();
    await page.waitForTimeout(300);
  }
}

export async function shoot(page: Page, name: string, options: ShotOptions = {}): Promise<void> {
  await page.screenshot({
    path: `${OUT_DIR}/${name}.png`,
    fullPage: !options.viewportOnly,
    animations: 'disabled',
  });
}

export async function capture(
  page: Page,
  name: string,
  path: string,
  options: ShotOptions = {}
): Promise<void> {
  await goTo(page, path, options);
  await shoot(page, name, options);
}
