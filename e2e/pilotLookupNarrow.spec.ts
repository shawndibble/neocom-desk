/**
 * Pilot Lookup at 390px (issue #2520).
 *
 * - A Recent kills and losses row cut the other pilot's name to ~9
 *   characters ("Victim: Aurelianu…"), with nowhere else on the page to read
 *   it: below `sm` the name now takes the row's last line of its own.
 * - The identity header's Corporation and Alliance links were once 44px
 *   targets; they are text height again, and must not overlap when they wrap.
 *
 * The looked-up pilot is the signed-in fixture character, whose public info,
 * corporation and alliance the shared ESI mock already answers. zKillboard
 * (answered empty by the shared mock) is overridden with one kill that
 * carries its killmail inline, so no ESI `/killmails/` read is made, and
 * `/universe/names` with the long names (a later `page.route` wins).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { ALLIANCE_ID, ALLIANCE_NAME, CHARACTER_ID, CORPORATION_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 820, height: 1100 };
/** A cold dev server can take longer than Playwright's default 5s to serve the route. */
const COLD_LOAD = { timeout: 15_000 };

const VICTIM_ID = 90000777;
const VICTIM_CORPORATION_ID = 98000777;
const VICTIM_NAME = 'Aurelianus Maximillian Thorncastle';
const TASH_MURKON_PRIME = 30001671;
const LONG_CORPORATION_NAME = 'Federation Navy Academy Reserve Division';
const RIFTER = 587;

const NAMES: Record<number, { name: string; category: string }> = {
  [VICTIM_ID]: { name: VICTIM_NAME, category: 'character' },
  [VICTIM_CORPORATION_ID]: { name: 'Victim Corp', category: 'corporation' },
  [TASH_MURKON_PRIME]: { name: 'Tash-Murkon Prime', category: 'solar_system' },
  [CORPORATION_ID]: { name: LONG_CORPORATION_NAME, category: 'corporation' },
  [ALLIANCE_ID]: { name: ALLIANCE_NAME, category: 'alliance' },
};

const KILL = {
  killmail_id: 130000001,
  killmail_time: '2026-10-01T12:00:00Z',
  solar_system_id: TASH_MURKON_PRIME,
  victim: {
    character_id: VICTIM_ID,
    corporation_id: VICTIM_CORPORATION_ID,
    ship_type_id: RIFTER,
    damage_taken: 1200,
    items: [],
  },
  attackers: [
    {
      character_id: CHARACTER_ID,
      corporation_id: CORPORATION_ID,
      ship_type_id: RIFTER,
      final_blow: true,
    },
  ],
  zkb: { hash: 'e2e-hash', totalValue: 12_500_000 },
};

const STATS = {
  shipsDestroyed: 12,
  shipsLost: 3,
  iskDestroyed: 4e8,
  iskLost: 6e7,
  dangerRatio: 62,
  gangRatio: 90,
};

async function mockPilot(page: Page) {
  await page.route('https://zkillboard.com/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.startsWith('/api/stats/')
      ? STATS
      : path.startsWith('/api/kills/characterID/')
        ? [KILL]
        : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body),
    });
  });
  await page.route(
    (url) => url.hostname === 'esi.evetech.net' && url.pathname === '/universe/names',
    (route) => {
      const ids = route.request().postDataJSON() as number[];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ids.map((id) => ({
            id,
            ...(NAMES[id] ?? { name: `Unknown ${id}`, category: 'character' }),
          }))
        ),
      });
    }
  );
}

async function openPilot(page: Page) {
  await signInAndGoto(page);
  await mockPilot(page);
  await page.goto(`./pilot-lookup?pilot=${CHARACTER_ID}`);
  await expect(page.getByText(VICTIM_NAME)).toBeVisible(COLD_LOAD);
}

function killmailRow(page: Page) {
  return page.getByRole('list', { name: 'Recent kills and losses' }).getByRole('button');
}

test.describe('Pilot Lookup at 390px', () => {
  test('the victim name shows in full and the org links do not overlap', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openPilot(page);

    const nameSpan = page.getByText(VICTIM_NAME).locator('..');
    const fits = await nameSpan.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);

    // The header's links stay text height (DESIGN.md "Touch tier"): they sit on
    // one line when they fit and wrap onto two when they do not, and either way
    // neither covers the other.
    const corpBox = await page.getByRole('link', { name: LONG_CORPORATION_NAME }).boundingBox();
    const allianceBox = await page.getByRole('link', { name: ALLIANCE_NAME }).boundingBox();
    if (corpBox === null || allianceBox === null) throw new Error('org links not laid out');
    const apart =
      corpBox.y + corpBox.height <= allianceBox.y || corpBox.x + corpBox.width <= allianceBox.x;
    expect(apart).toBe(true);

    await expectNoPageOverflow(page);
  });

  test('desktop keeps a one-line row and text-height org links', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openPilot(page);

    // One line is ~32px (py-1.5 around a 20px icon); a wrapped name would make it ~56px.
    const rowBox = await killmailRow(page).boundingBox();
    expect(rowBox?.height).toBeLessThan(40);
    const corpBox = await page.getByRole('link', { name: LONG_CORPORATION_NAME }).boundingBox();
    expect(corpBox?.height).toBeLessThanOrEqual(24);
  });

  test('the Look up button sits flush with the search box bottom', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openPilot(page);

    const box = await page.getByRole('combobox', { name: 'Pilot' }).boundingBox();
    const button = await page.getByRole('button', { name: 'Look up' }).boundingBox();
    if (box === null || button === null) throw new Error('search row not laid out');
    expect(Math.abs(box.y + box.height - (button.y + button.height))).toBeLessThanOrEqual(1);
  });

  test('a tablet shows the three meters in one row, a phone stacks them', async ({ page }) => {
    await page.setViewportSize(TABLET);
    await openPilot(page);
    const tops = async () =>
      Promise.all(
        ['Danger', 'Fleet size', 'Kills vs losses'].map(async (name) => {
          const box = await page.getByRole('meter', { name }).boundingBox();
          if (box === null) throw new Error(`${name} meter not laid out`);
          return Math.round(box.y);
        })
      );
    expect(new Set(await tops()).size).toBe(1);

    await page.setViewportSize(PHONE);
    expect(new Set(await tops()).size).toBe(3);
    await expectNoPageOverflow(page);
  });
});
