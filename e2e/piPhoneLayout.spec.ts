/**
 * PI phone layout (#2696): the Plan "What matters more?" row, the header
 * strip's buyback picker, the Map's Planets column head and "Got it".
 * Bounding boxes, not screenshots, since only a real layout engine can tell
 * overlap. `PI_SHOTS=<dir>` also writes screenshots for the side by side with
 * `docs/design/pi-tabs/ref/`.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function open(page: Page, tab: string): Promise<void> {
  await signInAndGoto(page, `./planetary-industry/${tab}`);
  await mockPlannerColonies(page, PLAN_WINS_COLONIES);
  await mockHubPrices(page);
  await page.goto(`./planetary-industry/${tab}`);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.PI_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

test.describe('PI phone layout', () => {
  test('Plan: "What matters more?" sits below the "Your planets" heading, not on it', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await open(page, 'plan');
    const heading = page.getByRole('heading', { name: 'Your planets' });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    const toggle = page.getByRole('group', { name: 'What matters more?' });
    const h = await box(heading);
    const t = await box(toggle);
    expect(t.y).toBeGreaterThanOrEqual(h.y + h.height);
    await shot(page, 'plan-phone');
  });

  test('header strip: the buyback picker shows its whole label', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, 'plan');
    const picker = page.getByRole('combobox', { name: 'Where do you sell?' });
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await picker.click();
    await page.getByRole('option', { name: /corp buyback/i }).click();
    const clipped = await picker.evaluate((el) => {
      return [el, ...el.querySelectorAll('*')].some((n) => n.scrollWidth > n.clientWidth);
    });
    expect(clipped).toBe(false);
  });

  for (const [label, viewport] of [
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ] as const) {
    test(`Map ${label}: the Planets "?" clears the next column, "Got it" is one line`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page, 'map');
      if (label === 'phone') {
        await page.getByRole('button', { name: 'Show full map' }).click({ timeout: 20_000 });
      }
      const board = page.getByRole('group', { name: /^Planet map/ });
      await expect(board).toBeVisible({ timeout: 20_000 });
      const planets = board.locator('section').first();
      const raw = board.locator('section[data-tier="0"]');
      const info = planets.getByRole('button', { name: /Planets/ }).first();
      const i = await box(info);
      const p = await box(planets);
      const r = await box(raw);
      // The visible circle stays in its column; the button's 24px hit area (4px past the
      // circle) may reach into the gutter, but never the next column.
      const c = await box(info.locator('span[aria-hidden="true"]'));
      expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.width);
      expect(i.x + i.width).toBeLessThanOrEqual(r.x);
      expect(p.x + p.width).toBeLessThanOrEqual(r.x);

      const gotIt = page.getByRole('button', { name: 'Got it' });
      // One line: the label's own text box is no taller than a line of it.
      const wrapped = await gotIt.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length > 1;
      });
      expect(wrapped).toBe(false);
      await shot(page, `map-${label}`);
    });
  }
});
