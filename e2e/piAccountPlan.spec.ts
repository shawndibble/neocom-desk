/**
 * Find best's whole-account plan against the fixture colonies: it plans in a
 * few seconds without freezing the page, follows the haul opt-in, never
 * overflows the page, and logs no console errors.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';
import { expectNoPageOverflow } from './support/overflow';

const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;

for (const [label, viewport] of VIEWPORTS) {
  test(`${label}: the whole-account plan appears, follows the haul opt-in, fits the page`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await page.setViewportSize(viewport);
    await signInAndGoto(page, './planetary-industry/colonies');
    await mockPlannerColonies(page, PLAN_WINS_COLONIES);
    await mockHubPrices(page);

    await page.goto('./planetary-industry/plan?q=find-best');
    const total = page.getByText('All planets together:');
    await expect(total).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Best use of all your planets')).toBeVisible();
    await expectNoPageOverflow(page);

    // A frozen page cannot answer a click: the opt-in is on Make more.
    await page.goto('./planetary-industry/plan');
    const optIn = page.getByRole('checkbox', { name: /haul between my planets/i });
    await expect(optIn).toBeVisible({ timeout: 30_000 });
    await optIn.check();

    await page.goto('./planetary-industry/plan?q=find-best');
    await expect(page.getByText('All planets together:')).toBeVisible({ timeout: 90_000 });
    // Pending line gone: the whole search finished.
    await expect(page.getByText('Planning your planets…')).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByText('Hauling between planets')).toBeVisible();
    await expectNoPageOverflow(page);

    // Buying a tier at the hub plans too, and says what buying adds.
    await page.getByRole('button', { name: /PI settings/i }).click();
    await page.getByRole('button', { name: 'P1', exact: true }).click();
    await expect(page.getByText('Buying at the hub')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Planning your planets…')).toHaveCount(0, { timeout: 90_000 });
    await expectNoPageOverflow(page);

    expect(errors.filter((e) => !/favicon|net::ERR/i.test(e))).toEqual([]);
  });
}
