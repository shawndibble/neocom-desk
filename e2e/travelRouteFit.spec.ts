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

    const more = page
      .getByRole('main')
      .getByRole('table')
      .getByRole('button', { name: /^More actions for / });
    await expect(more.first()).toBeVisible({ timeout: 15000 });
    await expectNoPageOverflow(page);
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('button')]
            .filter((b) => /^More actions for /.test(b.getAttribute('aria-label') ?? ''))
            .every((b) => b.getBoundingClientRect().right <= window.innerWidth)
        )
      )
      .toBe(true);
    await more.nth(1).click();
    await expect(page.getByRole('menuitem', { name: /^Avoid/ })).toBeVisible();
    await page.keyboard.press('Escape');

    const main = page.getByRole('main');
    const rules = main.getByText('Route rules', { exact: true }).first();
    const table = main.getByRole('table').first();
    const rulesBox = (await rules.boundingBox())!;
    const tableBox = (await table.boundingBox())!;
    if (width >= 1280) expect(tableBox.x + tableBox.width).toBeLessThanOrEqual(rulesBox.x);
    else expect(rulesBox.y).toBeGreaterThan(tableBox.y);
  });
}
