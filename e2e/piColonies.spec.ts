/**
 * PI Colonies, the daily check: what is stopped, running out or full, what to
 * do about it, and when to log in next.
 *
 * Playwright rather than jsdom for the layout claims (no sideways scroll at
 * 390px, 44px touch targets), which only a real layout engine can tell.
 * `PI_SHOTS=<dir>` also writes full-page screenshots there, for the side by
 * side with `docs/design/pi-tabs/ref/`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { SCOPES } from './support/fixtureData';
import { mockPlannerColonies, withVariants, type Colony } from './support/piColonies';

type ColonyVariants = Record<number, Partial<Colony>>;
import { piTier } from '../src/engine/pi/chain';
import type { PiData } from '../src/sde/types';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const JITA_I = 40009077;
const JITA_IV = 40009080;
const JITA_V = 40009082;

/** One colony stopped, one expiring today, one with a factory nothing feeds, the rest running. */
const DAILY: ColonyVariants = {
  [JITA_I]: { expiresInHours: 6, installedHoursAgo: 66 },
  [JITA_IV]: { expiresInHours: -3, installedHoursAgo: 75 },
  [JITA_V]: { idleBasics: 2 },
};

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;
const UNIT_PRICE = [5, 760, 14_000, 100_000, 1_900_000];

async function mockHubPrices(page: Page): Promise<void> {
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body: Record<string, unknown> = {};
    for (const raw of types.split(',').filter(Boolean)) {
      const sell = UNIT_PRICE[piTier(Number(raw), pi)];
      body[raw] = {
        buy: { max: sell * 0.95, volume: 500_000, orderCount: 40 },
        sell: { min: sell, volume: 500_000, orderCount: 40 },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function openColonies(page: Page, variants: ColonyVariants = DAILY): Promise<void> {
  await signInAndGoto(page, './planetary-industry/colonies');
  await mockPlannerColonies(page, withVariants(variants));
  await mockHubPrices(page);
  await page.goto('./planetary-industry/colonies');
  await expect(page.getByRole('heading', { name: "Today's check" })).toBeVisible({
    timeout: 20_000,
  });
  // Rows are in once every colony has a status.
  await expect(page.locator('[data-colony-status]')).toHaveCount(4);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.PI_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function assertNoOverflow(page: Page): Promise<void> {
  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
}

test.describe('PI Colonies, the daily check', () => {
  test('leads with the next thing to do, and ranks colonies worst first', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openColonies(page);

    // The stopped colony is the next thing, and it is due now.
    await expect(page.getByText(/^Restart Jita IV/)).toBeVisible();
    await expect(page.getByText('Log in next')).toBeVisible();

    const statuses = await page
      .locator('[data-colony-status]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-colony-status')));
    expect(statuses[0]).toBe('stopped');
    expect(statuses[1]).toBe('expiring');
    expect(statuses.at(-1)).toBe('healthy');

    await shot(page, 'colonies-desk');
  });

  test('has no Advisor left: no panel, no Advisor links, the old URL lands here', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(DESKTOP);
    await openColonies(page);
    await expect(page.getByRole('heading', { name: 'Advisor' })).toHaveCount(0);
    await expect(page.locator('a[href*="advisor"]')).toHaveCount(0);

    await page.goto('./planetary-industry/advisor');
    await expect(page).toHaveURL(/\/planetary-industry\/colonies/);
    await expect(page.getByRole('heading', { name: "Today's check" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('expands a row in place to its extractors, production and launchpad', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openColonies(page);

    const row = page.locator('[data-colony-status]').first();
    await row.getByRole('button', { name: /^Show details for / }).click();
    const region = row.getByRole('region');
    await expect(region.getByRole('heading', { name: 'Extractors' })).toBeVisible();
    await expect(region.getByRole('heading', { name: 'Production' })).toBeVisible();
    await expect(region.getByRole('heading', { name: 'Launchpad' })).toBeVisible();
    await expect(region.getByRole('link', { name: /Plan this colony/ })).toHaveAttribute(
      'href',
      /\/planetary-industry\/plan#plan-/
    );
    await shot(page, 'colonies-expanded-desk');
  });

  test('lays out at 390px without a sideways scroll, with 44px controls', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openColonies(page);
    await assertNoOverflow(page);

    const row = page.locator('[data-colony-status]').first();
    for (const control of [
      row.getByRole('button', { name: /^Show details for / }),
      row.getByRole('button', { name: /^More actions for / }),
      row.locator('button', { hasText: /Restart|Haul|Fix|Add|Details/ }).first(),
    ]) {
      // boundingBox() doesn't wait: a control still rendering reads as null.
      await expect(control).toBeVisible();
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await shot(page, 'colonies-phone');
    await row.getByRole('button', { name: /^Show details for / }).click();
    await assertNoOverflow(page);
    await shot(page, 'colonies-expanded-phone');
  });

  test('groups the other characters colonies with their data age and a Switch to action', async ({
    page,
  }) => {
    const ALT_ID = 90000004;
    const ALT_PLANET_ID = 40009998;
    await page.setViewportSize(DESKTOP);
    await signInAndGoto(page, './planetary-industry/colonies');
    await page.evaluate(
      async ({ id, planetId, scopes }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('neocom');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const fetchedAt = Date.now() - 26 * 3_600_000;
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(['characters', 'tokens', 'esiCache'], 'readwrite');
          tx.objectStore('characters').put({
            characterId: id,
            name: 'Vela Arrano',
            ownerHash: 'OWNERHASH4',
            addedAt: Date.now(),
          });
          tx.objectStore('tokens').put({
            characterId: id,
            accessToken: 'alt-access',
            refreshToken: 'fake-refresh',
            expiresAt: Date.now() + 3_600_000,
            scopes,
          });
          tx.objectStore('esiCache').put({
            characterId: id,
            key: 'planets',
            value: [
              {
                solar_system_id: 30000142,
                planet_id: planetId,
                planet_type: 'barren',
                owner_id: id,
                last_update: new Date(fetchedAt).toISOString(),
                upgrade_level: 4,
                num_pins: 1,
              },
            ],
            fetchedAt,
          });
          tx.objectStore('esiCache').put({
            characterId: id,
            key: `planet:${planetId}`,
            value: {
              links: [
                { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
                { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
              ],
              routes: [],
              pins: [
                {
                  pin_id: 1,
                  type_id: 2848,
                  latitude: 0,
                  longitude: 0,
                  install_time: new Date(fetchedAt - 30 * 3_600_000).toISOString(),
                  expiry_time: new Date(fetchedAt + 42 * 3_600_000).toISOString(),
                  extractor_details: {
                    heads: Array.from({ length: 6 }, (_, i) => ({
                      head_id: i,
                      latitude: 0,
                      longitude: 0,
                    })),
                    product_type_id: 2267,
                    qty_per_cycle: 6000,
                    cycle_time: 1800,
                  },
                },
                { pin_id: 3, type_id: 2256, latitude: 0.9, longitude: 0.5 },
                { pin_id: 4, type_id: 2469, latitude: 1.2, longitude: 0.5 },
              ],
            },
            fetchedAt,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
      },
      { id: ALT_ID, planetId: ALT_PLANET_ID, scopes: [...SCOPES] }
    );
    await page.route(`https://esi.evetech.net/characters/${ALT_ID}/**`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await mockPlannerColonies(page, withVariants(DAILY));
    await mockHubPrices(page);
    await page.goto('./planetary-industry/colonies');
    await expect(page.locator('[data-colony-status]')).toHaveCount(4, { timeout: 20_000 });

    await page.getByRole('button', { name: /show \d+ alt/i }).click();
    await expect(page.locator('[data-colony-status]')).toHaveCount(5);
    await expect(page.getByText('Includes your other characters')).toBeVisible();
    const group = page.locator('[data-character-group-header]', {
      has: page.getByRole('button', { name: 'Switch to Vela Arrano' }),
    });
    await expect(group.locator('time')).toBeVisible();
    // The read is a day old.
    await expect(page.getByText(/Updated 1d ago/)).toBeVisible();
    // Its own figure, labelled as outside the plan.
    await expect(group.getByText(/Makes ~/)).toBeVisible();
    await expect(group.getByText('not in your plan')).toBeVisible();
    await shot(page, 'colonies-alts-desk');
    await page.setViewportSize(PHONE);
    await assertNoOverflow(page);
    await shot(page, 'colonies-alts-phone');
  });

  test('says what the tab is for when there are no colonies, and points at Plan', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAndGoto(page, './planetary-industry/colonies');
    await page.route('https://esi.evetech.net/characters/*/planets**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.goto('./planetary-industry/colonies');
    await expect(page.getByText('No colonies yet').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'colonies-none-desk');
    await page.getByRole('link', { name: /Find the best thing to build/ }).click();
    await expect(page).toHaveURL(/\/planetary-industry\/plan/);
  });
});
