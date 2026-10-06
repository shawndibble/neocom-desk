/**
 * PI Map (#2796): the "What if I add a ___ planet?" box keeps one height from
 * placeholder to hover to ticked, so the page below it never jumps.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';

async function open(page: Page): Promise<void> {
  await signInAndGoto(page, './planetary-industry/map');
  await mockPlannerColonies(page, PLAN_WINS_COLONIES);
  await mockHubPrices(page);
  await page.goto('./planetary-industry/map');
}

/** Height of the box and the Y of whatever follows it. */
async function measure(page: Page) {
  return page.getByTestId('map-whatif').evaluate((el) => {
    let node: Element | null = el;
    while (node && !node.nextElementSibling) node = node.parentElement;
    return {
      height: el.getBoundingClientRect().height,
      nextY: (node?.nextElementSibling?.getBoundingClientRect().top ?? -1) + window.scrollY,
    };
  });
}

for (const [label, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }],
] as const) {
  test(`Map ${label}: what-if box height and the next element hold on hover and tick`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await open(page);
    if (label === 'phone') {
      await page.getByRole('button', { name: 'Show full map' }).click({ timeout: 20_000 });
    }
    await expect(page.getByTestId('map-whatif')).toBeVisible({ timeout: 20_000 });
    // The phone also has a Planets filter row; the board's own tile is the one that previews.
    const scope = label === 'phone' ? page.getByTestId('pi-map-scroll') : page;
    const missing = scope.getByRole('button', { name: /^Lava planet, you don't have one/ });
    await expect(missing).toBeVisible();

    const rest = await measure(page);
    await page.evaluate(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__cls += (e as unknown as { value: number }).value;
      }).observe({ type: 'layout-shift', buffered: false });
    });
    await missing.hover();
    await expect(page.getByTestId('map-whatif')).toContainText('What if I add a Lava planet?');
    const hover = await measure(page);
    // Page-wide layout shift across the hover stays at zero, not just this box (a tick opens the detail, which is meant to).
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(
      0.001
    );
    await missing.click();
    const ticked = await measure(page);
    expect(hover).toEqual(rest);
    expect(ticked).toEqual(rest);
    // Hovering a second type while the first is ticked drops the "best recipe" text. (Phone
    // opens a sheet over the board on tick, so only the docked panel can hover on.)
    if (label === 'desktop') {
      await scope.getByRole('button', { name: /^Ice planet, you don't have one/ }).hover();
      await expect(page.getByTestId('map-whatif')).toContainText('What if I add an Ice planet?');
      expect(await measure(page)).toEqual(rest);
    }
  });
}
