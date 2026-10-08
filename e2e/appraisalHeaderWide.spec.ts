/**
 * Appraisal result header with realistic big-haul figures (regression for
 * the #3009/#3010 header: `67,214,000,000 ISK (67.2B)` overflowed its group
 * and ran under the Cargo label at 1280, and all three groups overlapped at
 * 1024, because the other Appraisal specs only price short numbers).
 *
 * Asserts invariants, not pixels (CI fonts differ): the three groups don't
 * overlap, no group's content overflows its box, the page doesn't scroll
 * sideways, and the row menu button is inside the viewport.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';

const VELDSPAR = 1230;
/** 12,500,000 units at 0.1 m³ is 1,250,000 m³; at ~5,377 ISK each, a 67.2B sell. */
const PASTE = 'Veldspar\t12,500,000';

async function mockHubPrices(page: Page): Promise<void> {
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body = Object.fromEntries(
      types.split(',').map((raw) => {
        const hit = Number(raw) === 34 || Number(raw) === VELDSPAR;
        const count = hit ? '40' : '0';
        return [
          raw,
          {
            buy: { max: hit ? '4900.5' : '0', volume: '900000000', orderCount: count },
            sell: { min: hit ? '5377.12' : '0', volume: '900000000', orderCount: count },
          },
        ];
      })
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

for (const width of [1024, 1280, 1440]) {
  test(`result header keeps long figures inside their groups at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await signInAndGoto(page);
    await mockHubPrices(page);
    await page.goto('./market/appraisal?hub=jita');
    await page.getByLabel(/items from inventory/i).fill(PASTE);
    await page.getByRole('button', { name: 'Appraise', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Appraisal' })).toBeVisible({ timeout: 15_000 });

    const sell = page
      .getByRole('button', { name: /^Copy 6\d\.\dB ISK \(6\d,\d{3},\d{3},\d{3}\)$/ })
      .first();
    await expect(sell).toBeVisible();
    // The shorthand alone is printed; the full digits live in the hover and the copy.
    await expect(sell).toHaveText(/^6\d\.\dB$/);

    const geometry = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('section[aria-label]')].filter((s) =>
        s.querySelector(':scope > h3')
      ) as HTMLElement[];
      const boxes = groups.map((g) => {
        const r = g.getBoundingClientRect();
        return {
          name: g.getAttribute('aria-label'),
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          overflowX: g.scrollWidth - g.clientWidth,
        };
      });
      const table = document.querySelector('table[aria-label="Appraisal"]')!;
      const kebab = table.querySelector('td.dt-actions button')!.getBoundingClientRect();
      // The table's own scroll container: the kebab must be inside it without scrolling.
      let scroller: Element | null = table.parentElement;
      while (scroller && scroller.scrollWidth <= scroller.clientWidth && scroller !== document.body)
        scroller = scroller.parentElement;
      const clipRight = scroller ? scroller.getBoundingClientRect().right : window.innerWidth;
      const tableScrolls =
        scroller !== null && scroller !== document.body && scroller !== document.documentElement;
      return {
        boxes,
        kebabRight: kebab.right,
        clipRight,
        tableScrolls,
        viewport: window.innerWidth,
      };
    });

    expect(geometry.boxes.map((b) => b.name)).toEqual(
      expect.arrayContaining(["It's worth", 'Cargo'])
    );
    for (const b of geometry.boxes) expect(b.overflowX).toBeLessThanOrEqual(1);
    for (const [i, a] of geometry.boxes.entries()) {
      for (const b of geometry.boxes.slice(i + 1)) {
        const apart =
          a.right <= b.left + 1 ||
          b.right <= a.left + 1 ||
          a.bottom <= b.top + 1 ||
          b.bottom <= a.top + 1;
        expect(apart, `${a.name} overlaps ${b.name}`).toBe(true);
      }
    }
    expect(geometry.kebabRight, 'row menu button is clipped by the table').toBeLessThanOrEqual(
      geometry.clipRight + 1
    );
    expect(geometry.kebabRight).toBeLessThanOrEqual(geometry.viewport);
    await expectNoPageOverflow(page);
  });
}

for (const width of [390, 1024, 1280]) {
  test(`recent-list select sits in the paste card header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await signInAndGoto(page);
    await mockHubPrices(page);
    await page.goto('./market/appraisal?hub=jita');
    // No history yet: no select at all.
    await expect(page.getByRole('combobox', { name: 'Load a recent list' })).toHaveCount(0);
    await page.getByLabel(/items from inventory/i).fill(PASTE);
    await page.getByRole('button', { name: 'Appraise', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Appraisal' })).toBeVisible({ timeout: 15_000 });

    const select = page.getByRole('combobox', { name: 'Load a recent list' });
    await expect(select).toBeVisible();
    const g = await select.evaluate((el) => {
      const header = el.closest('header')!;
      const title = header.querySelector('h2')!.getBoundingClientRect();
      const h = header.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      const card = header.parentElement!.getBoundingClientRect();
      return {
        title: title.toJSON(),
        header: h.toJSON(),
        select: s.toJSON(),
        card: card.toJSON(),
        headerOverflow: header.scrollWidth - header.clientWidth,
      };
    });
    expect(g.select.left, 'select is to the right of the title').toBeGreaterThanOrEqual(
      g.title.right - 1
    );
    // Same row: vertical centres within the header's height, no wrap.
    expect(g.select.top).toBeGreaterThanOrEqual(g.header.top - 1);
    expect(g.select.bottom).toBeLessThanOrEqual(g.header.bottom + 1);
    expect(g.select.right).toBeLessThanOrEqual(g.card.right + 1);
    expect(g.select.width).toBeLessThan(g.card.width * 0.6);
    expect(g.headerOverflow).toBeLessThanOrEqual(1);
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: process.env.SHOT_DIR
        ? `${process.env.SHOT_DIR}/recent-${width}.png`
        : 'test-results/recent.png',
    });
  });
}
