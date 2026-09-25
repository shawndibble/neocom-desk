/**
 * Calendar's Map / Coming Up rail split at pointer widths (issue #1638).
 *
 * The Map panel used to hold a fixed 38rem from `md` up, so at 1024px the
 * Coming Up rail was squeezed to ~165px: due times wrapped to three lines and
 * the RSVP badge was clipped. From `md` the Map now gives up width so the rail
 * keeps at least 18rem; from `xl` up the Map keeps its 38rem.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const HOUR_MS = 3_600_000;

async function seedEventsAndOpen(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  const now = Date.now();
  await page.route(`**/characters/${CHARACTER_ID}/calendar`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          event_id: 1,
          event_date: new Date(now + 23.99 * HOUR_MS).toISOString(),
          title: 'Fleet op number one with a deliberately very long title',
          importance: 0,
          event_response: 'not_responded',
        },
        {
          event_id: 2,
          event_date: new Date(now + 30 * HOUR_MS).toISOString(),
          title: 'Corp meeting',
          importance: 0,
          event_response: 'accepted',
        },
      ]),
    })
  );
  await signInAndGoto(page, './calendar');
  const list = page.getByRole('list', { name: 'Coming Up' });
  await expect(list).toBeVisible();
  const rail = list.locator('xpath=ancestor::*[contains(@class,"min-w-72")][1]');
  const map = page
    .getByRole('group', { name: 'Calendar map' })
    .locator('xpath=ancestor::*[contains(@class,"38rem")][1]');
  return { list, rail, map };
}

test('at 1024px the Coming Up rail stays readable and the Map does not clip', async ({ page }) => {
  const { list, rail, map } = await seedEventsAndOpen(page, { width: 1024, height: 768 });

  const railBox = await rail.boundingBox();
  expect(railBox!.width).toBeGreaterThanOrEqual(288);

  const clipped = await list.evaluate(
    (el) => [...el.querySelectorAll('li')].filter((li) => li.scrollWidth > li.clientWidth).length
  );
  expect(clipped).toBe(0);

  const dueLabel = list.getByText(/^in \d+h \d+m$/).first();
  const lineHeight = await dueLabel.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const dueBox = await dueLabel.boundingBox();
  expect(dueBox!.height).toBeLessThanOrEqual(lineHeight + 1);

  const mapClipped = await map.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(mapClipped).toBe(false);
});

test('at 1440px the Map keeps 38rem and the rail its wide width', async ({ page }) => {
  const { rail, map } = await seedEventsAndOpen(page, { width: 1440, height: 900 });

  expect((await map.boundingBox())!.width).toBe(608);
  expect((await rail.boundingBox())!.width).toBe(532);
});
