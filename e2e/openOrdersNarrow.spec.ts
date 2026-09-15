/**
 * Open Orders problem-group disclosure row and Healthy toggle touch targets
 * (issue #1064): both were bare `<button>`s with no height class at all —
 * the group-header row that expands/collapses a problem group (e.g.
 * "Expiring or stale") rendered around 32px tall, and the Healthy group's
 * inline "Show/Hide healthy orders" link beside it was smaller still. Fixed
 * with `min-h-11 ... md:min-h-0`, the same precedent `src/app/Layout.tsx`'s
 * `NAV_LINK` already ships (see `git diff` on `OpenOrdersPanel.tsx`).
 *
 * Orders are seeded via a `page.route` override on
 * `GET /characters/{id}/orders`, registered before `loginAndSelectCharacter`
 * — the same pattern `mailNarrow.spec.ts` uses for the boot-time `/mail`
 * prefetch. `mockEsi.ts`'s `PREFETCHED_EMPTY` set answers this same endpoint
 * empty by default, and the app's own boot prefetch (`app/prefetch.ts`)
 * calls it immediately after login; overriding the route (rather than
 * seeding the `esiCache` Dexie row directly, as `miningTaxNarrow.spec.ts`
 * does for a key nothing else writes) means the boot prefetch itself
 * receives and caches these fixture orders, so there is no race between a
 * direct IndexedDB write and prefetch's own live write to the same
 * `[characterId, 'orders']` row.
 *
 * Two orders, matching `OpenOrdersPanel.test.tsx`'s own fixtures exactly
 * (`NO_COST_BASIS_ORDER` / `EXPIRING_ORDER`) so the problem classification
 * is already proven by unit test, not guessed here: one lands in
 * `expiringOrStale` (issued today, 5-day duration — no cost basis or
 * competition data needed for that problem to fire), the other in
 * `healthy` (30 days old, 90-day duration, no cost basis linked). No
 * station-price/cost-basis/skills seeding at all: with none supplied,
 * `buildOpenOrderRows` correctly leaves both orders' competition/floor
 * checks at "not beaten" / "no floor", so the only thing that can make the
 * expiring order unhealthy is its own expiry — exactly the lever this test
 * wants.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';
import type { MarketOrder } from '../src/esi/endpoints';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const REGION = 10000002;
/** Jita 4-4 — a real NPC station id, so `stationName` resolution never has to guess. */
const STATION_A = 60003760;

function order(
  fields: Pick<MarketOrder, 'order_id' | 'type_id' | 'price'> & Partial<MarketOrder>
): MarketOrder {
  return {
    region_id: REGION,
    location_id: STATION_A,
    is_buy_order: false,
    is_corporation: false,
    volume_remain: 10,
    volume_total: 10,
    issued: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    duration: 90,
    range: 'station',
    ...fields,
  };
}

/** Healthy sell order — no cost basis linked, no competition data supplied. Tritanium/Pyerite/Mexallon type ids are all in `public/data/types.json`, so name resolution never needs a live ESI call. */
const HEALTHY_ORDER = order({
  order_id: 103,
  type_id: 35,
  price: 700,
  volume_remain: 20,
  volume_total: 20,
});
/** Sell order expiring within the week — issued today, 5-day duration. */
const EXPIRING_ORDER = order({
  order_id: 201,
  type_id: 36,
  price: 300,
  issued: new Date().toISOString(),
  duration: 5,
  volume_remain: 5,
  volume_total: 5,
});

async function seedOpenOrders(page: Page): Promise<void> {
  // Registered before login so the app's own boot prefetch (which fetches
  // this exact endpoint right after login) receives these orders — see the
  // file header for why this beats a direct IndexedDB seed here.
  await page.route(`**/characters/${CHARACTER_ID}/orders`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([HEALTHY_ORDER, EXPIRING_ORDER]),
    })
  );
}

/**
 * Locates both controls and reads their rendered heights. Exact-match names:
 * the disclosure's accessible name is its group title plus row count
 * ("Expiring or stale · 1"), so a future second expiring order can't
 * silently keep this passing against the wrong count. The Healthy toggle
 * reliably reads "Show healthy orders" on first load since Healthy starts
 * folded (`DEFAULT_FILTER.hideHealthy`).
 */
async function getHeights(page: Page) {
  const disclosure = page.getByRole('button', { name: 'Expiring or stale · 1', exact: true });
  await expect(disclosure).toBeVisible();
  const healthyToggle = page.getByRole('button', { name: 'Show healthy orders', exact: true });
  await expect(healthyToggle).toBeVisible();

  const [disclosureHeight, healthyToggleHeight] = await Promise.all([
    disclosure.evaluate((el) => el.getBoundingClientRect().height),
    healthyToggle.evaluate((el) => el.getBoundingClientRect().height),
  ]);

  return { disclosure, disclosureHeight, healthyToggleHeight };
}

test.describe('Open Orders — problem-group disclosure row and Healthy toggle touch targets', () => {
  test.beforeEach(async ({ page }) => {
    await seedOpenOrders(page);
    await loginAndSelectCharacter(page);
  });

  test('group-header disclosure and Healthy toggle both meet the 44px floor at 390px', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./market?section=orders');

    const { disclosure, disclosureHeight, healthyToggleHeight } = await getHeights(page);
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

    expect(disclosureHeight).toBeGreaterThanOrEqual(44);
    expect(healthyToggleHeight).toBeGreaterThanOrEqual(44);
  });

  test('both revert to their compact height at and above md (1280px)', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./market?section=orders');

    const { disclosureHeight, healthyToggleHeight } = await getHeights(page);

    // Pinned to the real measured compact heights (`min-h-0` reverts to the
    // content box: 32px for the padded disclosure row, 16.5px for the
    // padding-less Healthy link's text line-height), not just "< 44" — a
    // loose upper bound would not catch a partial regression back toward
    // the touch-tier height.
    expect(disclosureHeight).toBeGreaterThanOrEqual(28);
    expect(disclosureHeight).toBeLessThanOrEqual(36);
    expect(healthyToggleHeight).toBeGreaterThanOrEqual(12);
    expect(healthyToggleHeight).toBeLessThanOrEqual(21);
  });
});
