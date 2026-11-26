import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { SCOPES } from './support/fixtureData';
import { mockPlannerColonies } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };

const GOALS = '9832:200,9848:30';

test.describe('PI Plan — Goal Planner', () => {
  test('lays the whole plan out at 390px without a sideways scroll', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './planetary-industry/colonies');
    await mockPlannerColonies(page);
    await mockHubPrices(page);
    await page.goto(`./planetary-industry/plan?goals=${GOALS}`);

    await expect(page.getByText(/^ISK\/day vs selling/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Changes' })).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Everything the goals need, by tier' })
    ).toBeAttached();
    const goalsBox = (await page.getByRole('heading', { name: 'Goals' }).boundingBox())!;
    const headlineBox = (await page.getByText(/^ISK\/day vs selling/).boundingBox())!;
    expect(goalsBox.y).toBeLessThan(headlineBox.y);
    await expectNoPageOverflow(page);
  });

  test.describe('held-back reason on touch (issue #3681)', () => {
    test.use({ hasTouch: true });

    test('a tap on a partly made line shows why, with no native title', async ({ page }) => {
      await page.setViewportSize(PHONE);
      await signInAndGoto(page, './planetary-industry/colonies');
      await mockPlannerColonies(page);
      await mockHubPrices(page);
      await page.goto('./planetary-industry/plan?goals=9832:2000');

      const table = page.getByRole('table', { name: 'Everything the goals need, by tier' });
      await expect(table).toBeAttached({ timeout: 20_000 });
      const heldBack = table.getByText(/^\d+% made$/).first();
      await expect(heldBack).toBeVisible();
      await expect(heldBack).not.toHaveAttribute('title');

      await heldBack.tap();
      await expect(page.getByRole('tooltip')).toContainText('a scarcer input elsewhere');
    });
  });
});

test.describe('PI Plan — phone headings and filters (issue #3863)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './planetary-industry/colonies');
    await mockPlannerColonies(page);
    await mockHubPrices(page);
  });

  test('the Rebuild panel title is not truncated at 390px', async ({ page }) => {
    await page.goto('./planetary-industry/plan?q=make-more');
    const heading = page.getByRole('heading', {
      name: /^(What to change|Then, if you want more: rebuild)$/,
    });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    const fit = await heading.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
  });

  test('all three Make segments sit inside the viewport at 390px', async ({ page }) => {
    await page.goto('./planetary-industry/plan?q=find-best');
    const make = page.getByRole('group', { name: 'Make' });
    await expect(make).toBeVisible({ timeout: 60_000 });
    const buttons = make.getByRole('button');
    await expect(buttons).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const box = (await buttons.nth(i).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    }
    const fit = await make.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
  });
});

test.describe('PI Colonies — Switch to an alt (issue #1770)', () => {
  const ALT_ID = 90000002;

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

  test('offers a 36px Switch action that stays on the page at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './planetary-industry/colonies');
    await seedNotLoadedAlt(page);
    await page.route(`https://esi.evetech.net/characters/${ALT_ID}/**`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await page.reload();

    await page.getByRole('button', { name: /show \d+ alt/i }).click();
    const action = page.getByRole('button', { name: 'Switch to Alt Hauler' });
    await expect(action).toBeVisible();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await expectNoPageOverflow(page);

    await action.click();
    await expect(action).toHaveCount(0);
    expect(new URL(page.url()).pathname).toContain('/planetary-industry');
  });
});

test.describe('PI Colonies — alt group data age (issue #2291)', () => {
  const ALT_ID = 90000003;
  const ALT_PLANET_ID = 40009999;
  const LONG_NAME = 'Abcdefghij Klmnopqrstuvwxy Zabcdefghi';
  const LAPTOP = { width: 1024, height: 768 };

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
    await signInAndGoto(page, './planetary-industry/colonies');
    const listFetchedAt = await seedCachedAlt(page);
    await page.route(`https://esi.evetech.net/characters/${ALT_ID}/**`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await page.route('https://esi.evetech.net/universe/systems/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          system_id: 30000142,
          name: 'Jita',
          security_status: 0.95,
          constellation_id: 20000020,
          star_id: 40009076,
        }),
      })
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

    const midline = (box: { y: number; height: number }) => box.y + box.height / 2;
    const offsetFromName = async (target: Locator) => {
      const nameBox = await header.getByText(LONG_NAME, { exact: true }).boundingBox();
      const targetBox = await target.boundingBox();
      return nameBox && targetBox ? Math.abs(midline(targetBox) - midline(nameBox)) : Infinity;
    };
    await expect.poll(() => offsetFromName(badge)).toBeLessThan(4);
    await expect.poll(() => offsetFromName(header.getByRole('button'))).toBeLessThan(4);
    await expectNoPageOverflow(page);
  });
});
