/**
 * Planetary Industry at phone and laptop widths.
 *
 * The Plan tab is the Goal Planner: a rail of goals, colonies and
 * assumptions stacked above the results on a phone. Its tables (hauling,
 * flow) stack into cards below `sm`, and the colony rows carry a customs box
 * and a reset beside long system names — the shapes that widen a 390px page
 * if anything in them refuses to wrap. Playwright rather than jsdom because
 * only a real layout engine can tell.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { SCOPES } from './support/fixtureData';
import { mockPlannerColonies } from './support/piColonies';
import { piTier } from '../src/engine/pi/chain';
import type { PiData } from '../src/sde/types';

const PHONE = { width: 390, height: 844 };

/** Coolant (P2) and Robotics (P3): the second needs a lava or plasma planet the fixture lacks. */
const GOALS = '9832:200,9848:30';

/** The graph the app itself bakes, so the engine's own `piTier` can read it. */
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/** Flat per tier, so a made tier is worth making. */
const UNIT_PRICE = [5, 760, 14_000, 100_000, 1_900_000];

/**
 * Quotes every type asked about, at its tier's price, both sides of the book.
 * A later `page.route` wins over an earlier one — see `support/testBase.ts`.
 */
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

/**
 * The page itself never scrolls sideways. Measured on the document, as
 * `appraisalSharedNarrow.spec.ts` does.
 */
async function assertNoOverflow(page: Page): Promise<void> {
  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
}

test.describe('PI Plan — Goal Planner', () => {
  test('lays the whole plan out at 390px without a sideways scroll', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './planetary-industry');
    await mockPlannerColonies(page);
    await mockHubPrices(page);
    await page.goto(`./planetary-industry/plan?goals=${GOALS}`);

    // Well past the 5s default: the tab awaits the SDE bake, every colony's
    // detail and a hub read, cold on a CI runner.
    await expect(page.getByText('Lift / day')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Changes' })).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Everything the goals need, by tier' })
    ).toBeAttached();
    // The rail comes first on a phone: inputs, then the answer.
    const goalsBox = (await page.getByRole('heading', { name: 'Goals' }).boundingBox())!;
    const headlineBox = (await page.getByText('Lift / day').boundingBox())!;
    expect(goalsBox.y).toBeLessThan(headlineBox.y);
    await assertNoOverflow(page);
  });
});

test.describe('PI Colonies — Switch to an alt (issue #1770)', () => {
  const ALT_ID = 90000002;

  /** An alt with the planets grant and nothing cached: the "not loaded yet" row. */
  async function seedNotLoadedAlt(page: Page): Promise<void> {
    await page.evaluate(
      async ({ id, scopes }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('neocom');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(['characters', 'tokens'], 'readwrite');
          tx.objectStore('characters').put({
            characterId: id,
            name: 'Alt Hauler',
            ownerHash: 'OWNERHASH2',
            addedAt: Date.now(),
          });
          tx.objectStore('tokens').put({
            characterId: id,
            accessToken: 'alt-access',
            refreshToken: 'fake-refresh',
            expiresAt: Date.now() + 3_600_000,
            scopes,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
      },
      { id: ALT_ID, scopes: [...SCOPES] }
    );
  }

  test('offers a 44px Switch action that stays on the page at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './planetary-industry');
    await seedNotLoadedAlt(page);
    // The app reads every signed-in character's ESI feeds; a 404 (not an empty list) keeps the alt's planets uncached, so it stays "not loaded".
    await page.route(`https://esi.evetech.net/characters/${ALT_ID}/**`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await page.reload();

    await page.getByRole('button', { name: /show \d+ alt/i }).click();
    const action = page.getByRole('button', { name: 'Switch to Alt Hauler' });
    await expect(action).toBeVisible();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await assertNoOverflow(page);

    await action.click();
    // The alt is now the primary character: it is no longer a "not loaded" row.
    await expect(action).toHaveCount(0);
    expect(new URL(page.url()).pathname).toContain('/planetary-industry');
  });
});

test.describe('PI Colonies — alt group data age (issue #2291)', () => {
  const ALT_ID = 90000003;
  const ALT_PLANET_ID = 40009999;
  /** EVE's longest allowed Character name: 37 characters. */
  const LONG_NAME = 'Abcdefghij Klmnopqrstuvwxy Zabcdefghi';
  const LAPTOP = { width: 1024, height: 768 };

  /** An alt whose colony list was cached three days ago, detail an hour ago. */
  async function seedCachedAlt(page: Page): Promise<number> {
    return page.evaluate(
      async ({ id, planetId, name, scopes }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('neocom');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const listFetchedAt = Date.now() - 3 * 86_400_000;
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(['characters', 'tokens', 'esiCache'], 'readwrite');
          tx.objectStore('characters').put({
            characterId: id,
            name,
            ownerHash: 'OWNERHASH3',
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
                planet_type: 'temperate',
                owner_id: id,
                last_update: new Date(listFetchedAt).toISOString(),
                upgrade_level: 3,
                num_pins: 0,
              },
            ],
            fetchedAt: listFetchedAt,
          });
          tx.objectStore('esiCache').put({
            characterId: id,
            key: `planet:${planetId}`,
            value: { links: [], routes: [], pins: [] },
            fetchedAt: Date.now() - 3_600_000,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
        return listFetchedAt;
      },
      { id: ALT_ID, planetId: ALT_PLANET_ID, name: LONG_NAME, scopes: [...SCOPES] }
    );
  }

  test('badges the alt header with its cache age, on one line with a 37-character name at 1024px', async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    await signInAndGoto(page, './planetary-industry');
    const listFetchedAt = await seedCachedAlt(page);
    // Alts are cache-only; a 404 keeps any stray live read from overwriting the seeded rows.
    await page.route(`https://esi.evetech.net/characters/${ALT_ID}/**`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await page.route(`https://esi.evetech.net/universe/planets/${ALT_PLANET_ID}**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          planet_id: ALT_PLANET_ID,
          name: 'Jita IV',
          system_id: 30000142,
          type_id: 11,
          position: { x: 0, y: 0, z: 0 },
        }),
      })
    );
    await page.reload();

    await page.getByRole('button', { name: /show \d+ alt/i }).click();
    const header = page.locator('[data-character-group-header]', {
      has: page.getByRole('button', { name: `Switch to ${LONG_NAME}` }),
    });
    const badge = header.locator('time');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('datetime', new Date(listFetchedAt).toISOString());

    // One row: the badge and the Switch action sit level with the name,
    // which truncates rather than pushing either onto a second line.
    const nameBox = (await header.getByText(LONG_NAME, { exact: true }).boundingBox())!;
    const badgeBox = (await badge.boundingBox())!;
    const switchBox = (await header.getByRole('button').boundingBox())!;
    const midline = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(midline(badgeBox) - midline(nameBox))).toBeLessThan(4);
    expect(Math.abs(midline(switchBox) - midline(nameBox))).toBeLessThan(4);
    await assertNoOverflow(page);
  });
});
