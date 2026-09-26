/**
 * The Characters toolbar (New Group / density / view mode) at 390px (#768).
 *
 * jsdom has no layout, so the unit tests can assert the controls render but
 * not that they share one row without overflow — the same reasoning
 * `filterSheetNarrow.spec.ts` and `corpBoardNarrow.spec.ts` give for running
 * this one against a real browser instead.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID, CHARACTER_NAME } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const PLANET_ID = 40_000_002;
const DAY_MS = 24 * 3_600_000;

/**
 * Both tests here start the same way. `support/login.ts`'s helper lands on
 * /overview, and this file is about the Characters toolbar specifically.
 */
async function landOnCharactersAtPhoneWidth(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await page.waitForLoadState('load');
  // A first-ever login lands on /overview (#1771); this file is about the list.
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto('./characters');
  await expect(page.getByRole('button', { name: `Select ${CHARACTER_NAME}` })).toBeVisible();
}

test('picking a Character from the More sheet returns to the page you switched from, not always Overview (#1764)', async ({
  page,
}) => {
  await landOnCharactersAtPhoneWidth(page);
  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await expect(page).toHaveURL(/\/overview$/);

  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });

  // Navigate away from Overview via the More sheet, so switching characters
  // has somewhere other than Overview to prove it returns to.
  await mobileNav.getByRole('button', { name: 'More' }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Wallet' }).click();
  await expect(page).toHaveURL(/\/wallet(\/|$)/);
  const walletUrl = page.url();

  // Switch characters via the More sheet's portrait+name row.
  await mobileNav.getByRole('button', { name: 'More' }).click();
  await page
    .getByRole('dialog', { name: 'More' })
    .getByRole('link', { name: CHARACTER_NAME })
    .click();
  await expect(page).toHaveURL(/\/characters$/);

  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await expect(page).toHaveURL(walletUrl);
});

test('New Group, density, and view-mode controls share one row at 390px', async ({ page }) => {
  await landOnCharactersAtPhoneWidth(page);

  const newGroup = page.getByRole('button', { name: 'New group' });
  const density = page.getByRole('combobox', { name: 'Density' });
  const cards = page.getByRole('button', { name: 'Cards' });
  const table = page.getByRole('button', { name: 'Table' });
  await expect(newGroup).toBeVisible();
  await expect(density).toBeVisible();
  await expect(cards).toBeVisible();
  await expect(table).toBeVisible();

  const [newGroupBox, densityBox, cardsBox] = await Promise.all([
    newGroup.boundingBox(),
    density.boundingBox(),
    cards.boundingBox(),
  ]);
  expect(newGroupBox).not.toBeNull();
  expect(densityBox).not.toBeNull();
  expect(cardsBox).not.toBeNull();
  // Same row: vertical centers line up rather than one control wrapping onto
  // its own line below the others.
  expect(
    Math.abs(newGroupBox!.y + newGroupBox!.height / 2 - (densityBox!.y + densityBox!.height / 2))
  ).toBeLessThan(4);
  expect(
    Math.abs(densityBox!.y + densityBox!.height / 2 - (cardsBox!.y + cardsBox!.height / 2))
  ).toBeLessThan(4);

  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
});

test('the table view shows Last synced age text at 390px (#1783)', async ({ page }) => {
  await landOnCharactersAtPhoneWidth(page);
  await page.getByRole('button', { name: 'Table' }).click();

  const age = page.locator('table td time').first();
  await expect(age).toBeVisible();
  await expect(age).not.toHaveText('');
});

/**
 * The sole logged-in Character is active on first login (`Callback.tsx`), so
 * one Character proves the marker is selective; a second, non-active card is
 * already covered in `Characters.test.tsx`. The colony's extractor expired a
 * day ago, so the chip reads a fixed "Stopped" rather than a countdown a slow
 * CI run could shift across a minute boundary.
 */
test('the active card shows aria-current and an Active label, and a stopped PI colony shows a warning chip, at 390px (#1793)', async ({
  page,
}) => {
  const installedAt = new Date(Date.now() - 15 * DAY_MS).toISOString();
  const expiresAt = new Date(Date.now() - DAY_MS).toISOString();

  // Must register before the first navigation: Overview's own login-time
  // prefetch hits `/planets` first, and "Refresh all" later reuses whatever
  // that first call cached rather than a fresh round trip.
  await page.route('https://esi.evetech.net/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (pathname === `/characters/${CHARACTER_ID}/planets`) {
      return json([
        {
          solar_system_id: 30_000_142,
          planet_id: PLANET_ID,
          planet_type: 'temperate',
          owner_id: CHARACTER_ID,
          upgrade_level: 5,
          num_pins: 3,
          last_update: installedAt,
        },
      ]);
    }
    if (pathname === `/characters/${CHARACTER_ID}/planets/${PLANET_ID}`) {
      return json({
        links: [],
        pins: [
          { pin_id: 1, type_id: 2254, latitude: 1, longitude: 1 },
          {
            pin_id: 2,
            type_id: 3068,
            latitude: 1.1,
            longitude: 1.1,
            extractor_details: {
              product_type_id: 2073,
              cycle_time: 1800,
              qty_per_cycle: 6965,
              head_radius: 0.01,
              heads: [{ head_id: 0, latitude: 1.1, longitude: 1.1 }],
            },
            install_time: installedAt,
            expiry_time: expiresAt,
            last_cycle_start: installedAt,
          },
        ],
      });
    }
    // The Overview board's own colony card reads the planet's name/type
    // alongside its status — not asserted here, but needs an answer so the
    // real-network guard (`support/testBase.ts`) doesn't fail the test.
    if (pathname === `/universe/planets/${PLANET_ID}`) {
      return json({ name: 'Efa II', type_id: 11, system_id: 30_000_142 });
    }
    return route.fallback();
  });

  await landOnCharactersAtPhoneWidth(page);

  const card = page.getByText(CHARACTER_NAME).locator('xpath=ancestor::li[1]');
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect(card.getByText('Active')).toBeVisible();

  await page.getByRole('button', { name: 'Refresh all' }).click();
  await expect(card.getByText('Stopped')).toBeVisible();
});

/**
 * `hasTouch` is scoped to this block, not the file: it flips
 * `(pointer: coarse)`/`(hover: none)`, and the row-layout test above must keep
 * measuring the rendering it was written against.
 */
test.describe('Refresh all on a touch device', () => {
  test.use({ hasTouch: true });

  const REFRESH_ALL_HINT =
    'Refresh all. Pulls live data for every character. This may take a moment for a large roster.';

  test('touch-and-hold reveals the Refresh all hint at 390px', async ({ page }) => {
    await landOnCharactersAtPhoneWidth(page);

    const refreshAll = page.getByRole('button', { name: 'Refresh all' });
    await expect(refreshAll).toBeVisible();
    // The hint used to live in a native `title=`, which touch can never reveal.
    await expect(refreshAll).not.toHaveAttribute('title');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    const box = await refreshAll.boundingBox();
    expect(box).not.toBeNull();
    const touchPoint = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

    // `page.touchscreen.tap()` is a tap, not a hold, so CDP drives the raw
    // touch sequence: hold past Tooltip's 500ms long-press, then *cancel*
    // rather than end it — a touchend synthesizes the click that would kick
    // off the refresh this test is only trying to read about.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint],
    });
    try {
      // `toHaveText` waits out the long-press delay on its own; `toBeVisible`
      // is what makes it "reachable" rather than merely present.
      await expect(page.getByRole('tooltip')).toHaveText(REFRESH_ALL_HINT);
      await expect(page.getByRole('tooltip')).toBeVisible();
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    }
  });
});
