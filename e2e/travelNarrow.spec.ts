/**
 * Travel at 390px (issue #2519).
 *
 * - Route Safety with no stops opened on a folded Stops panel and an empty
 *   state with nothing to press: the panel now stays open on a phone until
 *   there is a stop worth folding.
 * - A long Current System name ("TASH-MURKON PRIME (CURRENT SYSTEM)") pushed
 *   the shared solar-system picker past the screen on both tabs: its trigger
 *   now shrinks and ends in an ellipsis instead, at the same height.
 * - Thera / Turnur's filtered-to-zero state gained Reset filters.
 *
 * The shared ESI mock answers the Current System with Jita; tests that need
 * a long name override `/location` (a later `page.route` wins). It doesn't
 * answer `/universe/system_jumps` or `/universe/system_kills`, which Route
 * Safety reads once it has a route, so both are answered empty here.
 *
 * Issue #2522: the itinerary's leg headers and Travel's status notes set no
 * size, so they fell through to the browser's 16px; they now sit on the 14px
 * body size (`text-sm`).
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
/** A cold dev server can take longer than Playwright's default 5s to serve the route. */
const COLD_LOAD = { timeout: 15_000 };

const JITA = 30000142;
const TASH_MURKON_PRIME = 30001671;
const KOR_AZOR_PRIME = 30005038;
const AMARR = 30002187;
const DODIXIE = 30002659;
const THERA = 31000005;

/** Empty by default; `unavailable` answers 503 so Route Safety reports the figures as unread. */
async function mockUniverseStats(page: Page, unavailable = false) {
  await page.route(/esi\.evetech\.net\/(.*\/)?universe\/system_(jumps|kills)/, (route) =>
    unavailable
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

async function mockCurrentSystem(page: Page, systemId: number) {
  await page.route(`https://esi.evetech.net/**/characters/${CHARACTER_ID}/location*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ solar_system_id: systemId }),
    })
  );
}

/** One large hole out of Thera into Jita, alive for a day. */
async function mockOneTheraHole(page: Page) {
  await page.route('https://api.eve-scout.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([
        {
          id: '9001',
          signature_type: 'wormhole',
          out_system_id: THERA,
          out_signature: 'ABC-123',
          in_system_id: JITA,
          in_system_name: 'Jita',
          in_system_class: 'hs',
          in_region_name: 'The Forge',
          in_signature: 'XYZ-789',
          wh_type: 'Q063',
          max_ship_size: 'large',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      ]),
    })
  );
}

async function expectFontSize(locator: Locator, px: number) {
  await expect(locator).toHaveCSS('font-size', `${px}px`);
}

async function expectPickerFits(page: Page, name: RegExp) {
  const trigger = page.getByRole('button', { name });
  await expect(trigger).toBeVisible(COLD_LOAD);
  await expectNoPageOverflow(page);
  const box = (await trigger.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  // Truncated, not wrapped: one control-height line (`h-11` on a phone).
  expect(box.height).toBe(44);
}

test.describe('Travel at 390px', () => {
  test.beforeEach(async ({ page }) => {
    await mockUniverseStats(page);
    await page.setViewportSize(PHONE);
  });

  test('Route Safety with no stops shows Add a stop without a tap', async ({ page }) => {
    await signInAndGoto(page, './travel/route');
    await expect(page.getByRole('button', { name: 'Add a stop' })).toBeVisible(COLD_LOAD);
    await expect(page.getByRole('button', { name: 'Edit stops' })).toHaveCount(0);
  });

  test('Route Safety with a stop still opens folded', async ({ page }) => {
    await signInAndGoto(page, `./travel/route?stops=${AMARR}`);
    await expect(page.getByRole('button', { name: 'Edit stops' })).toBeVisible(COLD_LOAD);
    await expect(page.getByRole('button', { name: 'Add a stop' })).toHaveCount(0);
  });

  for (const [name, systemId] of [
    ['Tash-Murkon Prime', TASH_MURKON_PRIME],
    ['Kor-Azor Prime', KOR_AZOR_PRIME],
  ] as const) {
    test(`a ${name} Current System doesn't widen either tab`, async ({ page }) => {
      await mockCurrentSystem(page, systemId);
      await signInAndGoto(page, './travel/route');
      await expectPickerFits(page, new RegExp(`^Change starting system — ${name}`));

      await page.goto('./travel/thera');
      await expectPickerFits(
        page,
        new RegExp(`^Change the system jumps are counted from — ${name}`)
      );
    });
  }

  test('Thera filtered to zero offers Reset filters, which keeps the origin', async ({ page }) => {
    await mockOneTheraHole(page);
    await signInAndGoto(page, `./travel/thera?origin=${AMARR}&size=capital`);
    await expect(page.getByText('No connections match these filters')).toBeVisible(COLD_LOAD);

    await page.getByRole('button', { name: 'Reset filters' }).click();

    await expect(
      page.getByRole('table', { name: 'Open holes out of Thera and Turnur' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset filters' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Change the system jumps are counted from — Amarr$/ })
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`origin=${AMARR}`));
  });

  test('a two-stop trip sets its leg headers at 14px, without widening the page', async ({
    page,
  }) => {
    await signInAndGoto(page, `./travel/route?stops=${AMARR},${DODIXIE}`);
    const legs = page.getByRole('button', { name: /^Leg \d/ });
    await expect(legs).toHaveCount(2, COLD_LOAD);
    await expectFontSize(legs.nth(0), 14);
    await expectFontSize(legs.nth(1), 14);
    await expectNoPageOverflow(page);
  });

  test("Route Safety's unread last-hour figures note is 14px", async ({ page }) => {
    await mockUniverseStats(page, true);
    await signInAndGoto(page, `./travel/route?stops=${AMARR}`);
    const note = page.getByRole('status').filter({ hasText: "last-hour figures couldn't be read" });
    await expect(note).toBeVisible(COLD_LOAD);
    await expectFontSize(note, 14);
  });

  test('Thera with no origin sets its distance note at 14px', async ({ page }) => {
    // No Current System to fall back on: ESI has no location for the character.
    await page.route(`https://esi.evetech.net/**/characters/${CHARACTER_ID}/location*`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"none"}' })
    );
    await signInAndGoto(page, './travel/thera');
    const note = page.getByRole('status').filter({ hasText: 'Pick a system to count jumps from' });
    await expect(note).toBeVisible(COLD_LOAD);
    await expectFontSize(note, 14);
  });
});

test('Route Safety at 1280px: Stops never folds, and the Jita picker keeps its height', async ({
  page,
}) => {
  await mockUniverseStats(page);
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, `./travel/route?stops=${AMARR}`);
  const trigger = page.getByRole('button', { name: /^Change starting system — Jita/ });
  await expect(trigger).toBeVisible(COLD_LOAD);
  await expect(page.getByRole('button', { name: 'Edit stops' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a stop' })).toBeVisible();
  // `md:h-9`: the same single line as before the trigger learned to truncate.
  expect((await trigger.boundingBox())!.height).toBe(36);
});
