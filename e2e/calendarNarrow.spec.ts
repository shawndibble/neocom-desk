/**
 * Coming Up Rail's "Show all days" control touch target (issue #1077): once
 * a day is selected in the phone Day Ticker, the rail's header grows a
 * "Show all days" link to clear the filter. It was a bare `<button>` with no
 * height/padding-y class at all — its own hit box was ~16-18px, under both
 * the 44px touch tier and the 24px WCAG floor, even though the panel header
 * around it is already `min-h-11` (`Panel`'s header uses `items-center`
 * without stretching the action to fill that height). Fixed with
 * `flex min-h-11 items-center ... md:min-h-0`, the same precedent as
 * #1064's Open Orders Healthy toggle (identical prior className).
 *
 * No calendar-event fixture is needed: "Show all days" renders purely off
 * `selectedDayMs !== null`, independent of whether the rail has any items.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * Logs in, sets the viewport, opens Calendar and selects the first day —
 * the phone Day Ticker and the desktop Calendar Map grid share the same
 * `role="group"`/`aria-label="Calendar map"` pair but render mutually
 * exclusively (`Calendar.tsx`'s `isNarrow` ternary), so this locator is
 * unambiguous at either viewport.
 */
async function selectFirstCalendarDay(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await signInAndGoto(page, './calendar');

  const grid = page.getByRole('group', { name: 'Calendar map' });
  await grid.getByRole('button').first().click();
}

test('"Show all days" meets the 44px touch floor at 390px, and still clears the filter', async ({
  page,
}) => {
  await selectFirstCalendarDay(page, PHONE);

  const clearDay = page.getByRole('button', { name: 'Show all days' });
  await expect(clearDay).toBeVisible();

  const height = await clearDay.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);

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
  // `md:min-h-0` drops the floor rather than pinning back to a fixed value
  // — pinned to the real measured content-driven height, not just "< 44",
  // so a loose upper bound can't miss a partial regression toward the
  // touch-tier height.
  expect(height).toBeGreaterThanOrEqual(10);
  expect(height).toBeLessThanOrEqual(20);
});

test('a Station Manager sees a moon chunk on the phone rail, without overflow', async ({
  page,
}) => {
  const now = Date.now();
  // Registered after `installEsiMock` (the `page` fixture's setup), so these win.
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Station_Manager'] });
    if (path === `/corporations/${CORPORATION_ID}/structures`) return json([]);
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
