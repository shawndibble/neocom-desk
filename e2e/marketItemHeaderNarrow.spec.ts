/**
 * Market Browser item panel header at phone width (issue #1945): the shared
 * `Panel` heading was `whitespace-nowrap` with no `min-w-0` when a caller
 * passed `headingRef`, so a long item name pushed the price-alert bell and
 * Show info off the panel's right edge and made the page scroll sideways.
 * Below `md` the name now wraps inside the header; at and above `md` it is
 * unchanged.
 *
 * Asserts containment rather than a character count, and hides the classic
 * scrollbar so the overflow check measures the layout a phone gets.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const LONG_NAME = 'Mjolnir Auto-Targeting Heavy Missile I Blueprint';

async function openLongItem(page: Page) {
  // The item view fetches an Order Book and Price History; the header
  // under test doesn't care what they hold, so both answer empty.
  for (const kind of ['orders', 'history']) {
    await page.route(`https://esi.evetech.net/markets/*/${kind}*`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
  }
  await page.route('https://esi.evetech.net/universe/types/*', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"nf"}' })
  );
  await signInAndGoto(page, './market?section=browser');
  await page.addStyleTag({ content: 'html{scrollbar-width:none}' });
  await page.getByRole('searchbox', { name: 'Search items' }).fill(LONG_NAME);
  await page.getByRole('button', { name: LONG_NAME, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: LONG_NAME })).toBeVisible();
}

async function box(locator: ReturnType<Page['locator']>) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

test('long item name keeps header actions inside the panel at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openLongItem(page);

  const heading = page.getByRole('heading', { level: 2, name: LONG_NAME });
  const panel = page.locator('section').filter({ has: heading });
  const info = panel.getByRole('button', { name: 'Show info' });
  const bell = panel.locator('header').getByRole('button').nth(1);
  const back = panel.locator('header').getByRole('button').first();

  const p = await box(panel);
  const i = await box(info);
  expect(i.x).toBeGreaterThanOrEqual(p.x);
  expect(i.x + i.width).toBeLessThanOrEqual(p.x + p.width);

  const centers = await Promise.all(
    [back, bell, info].map(async (l) => {
      const b = await box(l);
      return b.y + b.height / 2;
    })
  );
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(heading).toBeFocused();
});

test('item header keeps its single-line heading at 1280px', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openLongItem(page);

  const heading = page.getByRole('heading', { level: 2, name: LONG_NAME });
  const h = await box(heading);
  expect(h.height).toBeLessThan(24);
  expect(await heading.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
});
