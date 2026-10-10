/**
 * Pilot Lookup's pasted Local list (issue #3321): each group is its own table,
 * so the Standing and kill-count columns must be pinned or every table sizes
 * them to its own content and the counts start at a different x down the page.
 * Two groups with very different content lengths (a long corporation name and
 * a 30-character pilot name against a short one) must still line up.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const DESKTOP = { width: 1440, height: 900 };
const NARROW_DESKTOP = { width: 1024, height: 800 };
const COLD_LOAD = { timeout: 15_000 };

const LONG_NAME = 'Aurelianus Maximillian Thornca';
const SHORT_NAME = 'Ab Cd';
const LONG_ID = 90001001;
const SHORT_ID = 90001002;
const LONG_CORP_ID = 98001001;
const SHORT_CORP_ID = 98001002;
const LONG_CORP = 'Federation Navy Academy Reserve Division Of The Outer Rim';
const SHORT_CORP = 'Tiny';
const SYSTEM_ID = 30001671;
const RIFTER = 587;

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

async function mockLocalList(page: Page) {
  // The long-named pilot killed lately; the short-named one did not.
  const kill = {
    killmail_id: 130000009,
    killmail_time: new Date(Date.now() - 3_600_000).toISOString(),
    solar_system_id: SYSTEM_ID,
    victim: { character_id: 90009999, corporation_id: SHORT_CORP_ID, ship_type_id: RIFTER },
    attackers: [{ character_id: LONG_ID, corporation_id: LONG_CORP_ID, ship_type_id: RIFTER }],
    zkb: { hash: 'e2e-hash', totalValue: 1_000_000 },
  };
  await page.route('https://zkillboard.com/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path.startsWith('/api/kills/characterID/') && path.includes(`/${LONG_ID}/`) ? [kill] : [];
    return route.fulfill(json(body));
  });
  // Typing a name asks for suggestions; none needed here.
  await page.route(
    (url) => url.hostname === 'esi.evetech.net' && url.pathname.endsWith('/search'),
    (route) => route.fulfill(json({}))
  );
  await page.route(
    (url) => url.hostname === 'esi.evetech.net' && url.pathname === '/universe/ids',
    (route) =>
      route.fulfill(
        json({
          characters: [
            { id: LONG_ID, name: LONG_NAME },
            { id: SHORT_ID, name: SHORT_NAME },
          ],
        })
      )
  );
  await page.route(
    (url) => url.hostname === 'esi.evetech.net' && url.pathname === '/characters/affiliation',
    (route) =>
      route.fulfill(
        json([
          { character_id: LONG_ID, corporation_id: LONG_CORP_ID },
          { character_id: SHORT_ID, corporation_id: SHORT_CORP_ID },
        ])
      )
  );
  await page.route(
    (url) => url.hostname === 'esi.evetech.net' && url.pathname === '/universe/names',
    (route) => {
      const ids = route.request().postDataJSON() as number[];
      return route.fulfill(
        json(
          ids.map((id) => ({
            id,
            name:
              id === LONG_CORP_ID ? LONG_CORP : id === SHORT_CORP_ID ? SHORT_CORP : `Unknown ${id}`,
            category: id >= 98000000 ? 'corporation' : 'character',
          }))
        )
      );
    }
  );
}

async function pasteLocalList(page: Page) {
  await signInAndGoto(page);
  await mockLocalList(page);
  await page.goto('./pilot-lookup');
  const box = page.getByRole('combobox', { name: 'Pilot' });
  await box.fill(`${LONG_NAME}\n${SHORT_NAME}`);
  await box.press('Control+Enter');
  await expect(page.getByText(LONG_CORP)).toBeVisible(COLD_LOAD);
  await expect(page.getByText(SHORT_CORP)).toBeVisible(COLD_LOAD);
}

async function headerBox(table: ReturnType<Page['getByRole']>, name: string) {
  const box = await table.getByRole('columnheader', { name }).boundingBox();
  if (box === null) throw new Error(`${name} header not laid out`);
  return box;
}

test.describe('Pilot Lookup Local list columns', () => {
  for (const size of [DESKTOP, NARROW_DESKTOP]) {
    test(`Standing and kill-count columns line up across group tables at ${size.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await pasteLocalList(page);

      const tables = page.getByRole('table');
      await expect(tables).toHaveCount(2);
      for (const name of ['Standing', 'Highsec', 'Lowsec', 'Nullsec']) {
        const first = await headerBox(tables.nth(0), name);
        const second = await headerBox(tables.nth(1), name);
        expect(Math.round(first.x), `${name} x`).toBe(Math.round(second.x));
        expect(Math.round(first.width), `${name} width`).toBe(Math.round(second.width));
      }

      // A 30-character name wraps rather than being clipped.
      const name = page.getByText(LONG_NAME, { exact: true });
      await expect(name).toBeVisible();
      const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped).toBe(false);
    });
  }
});
