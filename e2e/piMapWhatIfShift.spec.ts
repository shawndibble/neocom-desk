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
  test(`Map ${label}: what-if preview floats on hover without moving the next element`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await open(page);
    if (label === 'phone') {
      await page.getByRole('button', { name: 'Show full map' }).click({ timeout: 20_000 });
    }
    const scope = label === 'phone' ? page.getByTestId('pi-map-scroll') : page;
    const missing = scope.getByRole('button', { name: /^Lava planet, you don't have one/ });
    await expect(missing).toBeVisible({ timeout: 20_000 });

    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => page.evaluate(() => [...document.images].every((image) => image.complete)))
      .toBe(true);
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
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done()))
        )
    );
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(
      0.001
    );
    expect(hover).toEqual(rest);
    await missing.click();
    if (label === 'desktop') {
      await scope.getByRole('button', { name: /^Ice planet, you don't have one/ }).hover();
      await expect(page.getByTestId('map-whatif')).toContainText('What if I add an Ice planet?');
    }
  });
}
