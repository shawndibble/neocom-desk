/**
 * Travel › Route Safety at the narrow end of the pointer-width range (#2591):
 * beside a side column at `lg` the route table got too little width, so the
 * page scrolled sideways and Avoid sat off-screen. The route and the Route
 * rules column (right of the route) sit side by side only from `xl`; below
 * that they stack, route table full width.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';

const JITA = 30000142;
const AMARR = 30002187;
const PERIMETER = 30000144;

for (const width of [1024, 1280, 1440]) {
  test(`Route Safety fits the page at ${width}px`, async ({ page }) => {
    await page.route('https://esi.evetech.net/**/universe/system_kills*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.route('https://esi.evetech.net/**/universe/system_jumps*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await signInAndGoto(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`./travel/route?from=${JITA}&stops=${AMARR},${PERIMETER}`);

    const avoid = page.getByRole('button', { name: /^Avoid/ });
    await expect(avoid.first()).toBeVisible({ timeout: 15000 });
    await expectNoPageOverflow(page);
    // One in-page pass: the rows keep re-rendering as kills/jumps land, so a
    // snapshot of locators goes stale.
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('button')]
            .filter((b) => /^Avoid/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
            .every((b) => b.getBoundingClientRect().right <= window.innerWidth)
        )
      )
      .toBe(true);

    const main = page.getByRole('main');
    const rules = main.getByText('Route rules', { exact: true }).first();
    const table = main.getByRole('table').first();
    const rulesBox = (await rules.boundingBox())!;
    const tableBox = (await table.boundingBox())!;
    if (width >= 1280) expect(tableBox.x + tableBox.width).toBeLessThanOrEqual(rulesBox.x);
    else expect(rulesBox.y).toBeGreaterThan(tableBox.y);
  });
}
