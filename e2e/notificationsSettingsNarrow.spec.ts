/**
 * Settings › Notifications: the event-first page's touch targets and sheet at
 * 390px (originally issue #1118, for the per-Character disclosure header).
 *
 * Every event row is one button that opens that event's Characters, and the
 * row's own two checkboxes sit beside it. A phone thumb needs the button at
 * the 44px floor, the checkboxes must stay independently tappable, and the
 * phone opens a bottom sheet rather than growing the page.
 *
 * Asserted on the rendered bounding box rather than the class string; see
 * `loyaltyStoreNarrow.spec.ts` for why.
 *
 * Uses the default seeded character with no Dexie overrides.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_NAME } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoNotificationSettings(page: Page) {
  await signInAndGoto(page, './settings/notifications');
  await page.waitForURL(/\/settings\/notifications$/);
}

function eventToggle(page: Page, event: string) {
  return page.getByRole('button', { name: event, exact: true });
}

test('an event row meets the 44px touch floor at 390px and opens a sheet with its characters', async ({
  page,
}) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);

  const toggle = eventToggle(page, 'Skill queue ending');
  await expect(toggle).toBeVisible();
  const height = await toggle.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);

  // A click 3px below the row's top edge, clear of the label text, must still open it.
  const box = await toggle.boundingBox();
  if (!box) throw new Error('toggle has no bounding box');
  await page.mouse.click(box.x + 40, box.y + 3);

  const sheet = page.getByRole('dialog', { name: 'Skill queue ending' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(CHARACTER_NAME)).toBeVisible();
});

test('the row-level checkboxes stay independently clickable beside the enlarged toggle at 390px', async ({
  page,
}) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);

  const alerts = page.getByRole('checkbox', {
    name: 'Skill queue ending for every character, Alerts list',
  });
  await expect(alerts).toBeVisible();
  const before = await alerts.isChecked();

  await alerts.click();
  await expect(alerts).toBeChecked({ checked: !before });
  // The toggle grew as a flex sibling, not an overlay: the click changed the
  // checkbox and did not open the row.
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an event row stays content-driven at and above md (1280px), and opens inline', async ({
  page,
}) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(DESKTOP);

  const toggle = eventToggle(page, 'Skill queue ending');
  await expect(toggle).toBeVisible();
  const height = await toggle.evaluate((el) => el.getBoundingClientRect().height);
  // `md:min-h-9` drops the touch floor: 36px, bounded so a regression toward the touch tier shows.
  expect(height).toBeGreaterThanOrEqual(30);
  expect(height).toBeLessThanOrEqual(40);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(CHARACTER_NAME).first()).toBeVisible();
});

test('skillQueueEnding warn-ahead select is reachable at 390px (issue #1410)', async ({ page }) => {
  // The threshold controls sit in the same wrapping layout as every other
  // inline control, so a narrow viewport is where one sliding off-row would
  // first show up.
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);

  await eventToggle(page, 'Skill queue ending').click();
  const sheet = page.getByRole('dialog', { name: 'Skill queue ending' });
  await sheet.getByRole('button', { name: /^Warn-ahead time/ }).click();
  await expect(
    sheet.getByRole('combobox', { name: 'Warn this far before the skill queue runs dry:' })
  ).toBeVisible();
});
