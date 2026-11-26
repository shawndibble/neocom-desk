import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';

const HOUR_MS = 3_600_000;

async function selectFirstCalendarDay(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await signInAndGoto(page, './calendar');

  const grid = page.getByRole('group', { name: 'Calendar map' });
  await grid.getByRole('button').first().click();
}

test('"Show all days" meets the 36px touch floor at 390px, and still clears the filter', async ({
  page,
}) => {
  await selectFirstCalendarDay(page, PHONE);

  const clearDay = page.getByRole('button', { name: 'Show all days' });
  await expect(clearDay).toBeVisible();

  const height = await clearDay.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(36);

  await clearDay.click();
  await expect(clearDay).not.toBeVisible();
});

test('"Show all days" keeps its plain text-link size at and above md (1280px)', async ({
  page,
}) => {
  await selectFirstCalendarDay(page, DESKTOP);

  const clearDay = page.getByRole('button', { name: 'Show all days' });
  await expect(clearDay).toBeVisible();

  const height = await clearDay.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(24);
  expect(height).toBeLessThanOrEqual(28);
});

test('period-nav controls meet the 36px touch floor at 390px (#2107)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './calendar');

  const prev = page.getByRole('button', { name: /previous (month|fortnight)/i });
  const next = page.getByRole('button', { name: /next (month|fortnight)/i });
  const today = page.getByRole('button', { name: 'Today', exact: true });

  for (const control of [prev, next, today]) {
    await expect(control).toBeVisible();
    const height = await control.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(36);
  }
});

test('RSVP buttons meet the 36px touch floor at 390px (#2107)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const now = Date.now();
  await page.route(`**/characters/${CHARACTER_ID}/calendar`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          event_id: 1,
          event_date: new Date(now + 23.99 * HOUR_MS).toISOString(),
          title: 'Fleet op',
          importance: 0,
          event_response: 'not_responded',
        },
      ]),
    })
  );
  await page.route(`**/characters/${CHARACTER_ID}/calendar/1`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        event_id: 1,
        title: 'Fleet op',
        date: new Date(now + 23.99 * HOUR_MS).toISOString(),
        duration: 60,
        importance: 0,
        owner_id: 1,
        owner_name: 'Fleet Commander',
        owner_type: 'character',
        response: 'not_responded',
        text: 'Bring your own ships.',
      }),
    })
  );
  await signInAndGoto(page, './calendar');

  await page.getByRole('button', { name: 'Fleet op' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  for (const label of ['Accept', 'Decline', 'Tentative']) {
    const button = dialog.getByRole('button', { name: label });
    await expect(button).toBeVisible();
    const height = await button.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(36);
  }
});

test('a Station Manager sees a moon chunk on the phone rail, without overflow', async ({
  page,
}) => {
  const now = Date.now();
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Station_Manager'] });
    if (path === `/corporations/${CORPORATION_ID}/structures`) return json([]);
    if (path === `/corporations/${CORPORATION_ID}/structures/skyhooks`) {
      return json({ skyhooks: [] });
    }
    if (path === `/corporation/${CORPORATION_ID}/mining/extractions`) {
      return json([
        {
          structure_id: 1,
          moon_id: 40000001,
          extraction_start_time: new Date(now).toISOString(),
          chunk_arrival_time: new Date(now + 6 * 3_600_000).toISOString(),
          natural_decay_time: new Date(now + 2 * 86_400_000).toISOString(),
        },
      ]);
    }
    await route.fallback();
  });

  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './calendar', [...SCOPES, ...scopesForGroup('corp')]);

  await expect(page.getByText('Moon 40000001')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
