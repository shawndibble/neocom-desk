import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_NAME } from './support/fixtureData';

async function gotoNotificationSettings(page: Page) {
  await signInAndGoto(page, './settings/notifications');
  await page.waitForURL(/\/settings\/notifications$/);
}

function eventToggle(page: Page, event: string) {
  return page.getByRole('button', { name: event, exact: true });
}

async function openPhoneTopic(page: Page, topic: RegExp) {
  await page.getByRole('button', { name: topic }).click();
}

const TOPICS = [
  /^Skills/,
  /^Industry and PI/,
  /^Market and contracts/,
  /^Mail and calendar/,
  /^Space and community/,
  /^Corp/,
  /^EVE notifications/,
];

test('an event row meets the 36px touch floor at 390px and opens a sheet with its characters', async ({
  page,
}) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);
  await openPhoneTopic(page, /^Skills/);

  const toggle = eventToggle(page, 'Skill queue ending');
  await expect(toggle).toBeVisible();
  const height = await toggle.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(36);

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
  await openPhoneTopic(page, /^Skills/);

  const alerts = page.getByRole('checkbox', {
    name: 'Skill queue ending for every character, Alerts list',
  });
  await expect(alerts).toBeVisible();
  const before = await alerts.isChecked();

  await alerts.click();
  await expect(alerts).toBeChecked({ checked: !before });
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
  expect(height).toBeGreaterThanOrEqual(30);
  expect(height).toBeLessThanOrEqual(40);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(CHARACTER_NAME).first()).toBeVisible();
});

test('skillQueueEnding warn-ahead select is reachable at 390px (issue #1410)', async ({ page }) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);
  await openPhoneTopic(page, /^Skills/);

  const row = page.getByRole('listitem').filter({ has: eventToggle(page, 'Skill queue ending') });
  await row.getByRole('button', { name: /^Warn-ahead time/ }).click();
  await expect(
    row.getByRole('combobox', { name: 'Warn this far before the skill queue runs dry:' })
  ).toBeVisible();
});

test('no event name is truncated at 390px, in any topic', async ({ page }) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);

  for (const topic of TOPICS) {
    await openPhoneTopic(page, topic);
    const names = page.locator('[data-event-name]');
    await expect(names.first()).toBeVisible();
    const clipped = await names.evaluateAll((spans) =>
      spans.filter((span) => span.scrollWidth > span.clientWidth).map((span) => span.textContent)
    );
    expect(clipped, `clipped names in ${String(topic)}`).toEqual([]);
    await page.getByRole('button', { name: 'All topics' }).click();
  }
});

test('the first screen at 390px shows Delivery and the first topics', async ({ page }) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);

  for (const locator of [
    page.getByRole('checkbox', { name: 'Enable notifications', exact: true }),
    page.getByRole('checkbox', { name: 'Dismiss on View', exact: true }),
    page.getByRole('button', { name: /^Skills/ }),
    page.getByRole('button', { name: /^Industry and PI/ }),
  ]) {
    await expect(locator).toBeInViewport();
  }
});

test('Delivery fits one line at 1080px', async ({ page }) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize({ width: 1080, height: 800 });

  const items = [
    page.getByRole('checkbox', { name: 'Enable notifications', exact: true }),
    page.getByRole('checkbox', { name: 'Device pop-ups', exact: true }),
    page.getByRole('checkbox', { name: 'Alerts list', exact: true }),
    page.getByRole('checkbox', { name: 'Dismiss on View', exact: true }),
  ];
  const tops = [];
  for (const item of items) {
    await expect(item).toBeVisible();
    tops.push(await item.evaluate((el) => Math.round(el.getBoundingClientRect().top)));
  }
  expect(new Set(tops).size).toBe(1);
});
