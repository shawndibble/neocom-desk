/**
 * The Advisor tab's Worklist toggle on a phone.
 *
 * The toggle is the only control that switches which worklist a pilot reads,
 * and it shipped as two hand-styled buttons about 20px tall — under the touch
 * floor, on the tab's own lead panel. This pins the hit area at both ends of
 * the breakpoint it now sizes from.
 *
 * The colony fixture is `piAdvisor.spec.ts`'s, copied: one mis-built colony
 * and one dig-and-hold colony, because the toggle renders only when the
 * worklist finds at least one rebuild candidate.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter, clearCachedEsiRows } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
/*
 * Exactly `md` — where `controlHeightClassName`'s `md:h-9` engages, so the one
 * width a breakpoint mismatch in this fix would surface at. The chip is
 * expected to *reach* 36px here rather than keep its old ~20px: that chip sat
 * below every tier on the scale, so any of them grows it. The `Panel` header
 * grows with it — `md:min-h-9` is a floor and its own `py-1` sits outside the
 * chip — to the 44px any `actions` slot holding an `IconButton size="md"`
 * already stands at.
 */
const MD_EDGE = { width: 768, height: 800 };

const TOUCH_FLOOR = 44;
const DESKTOP_HEIGHT = 36;

const SYSTEM_ID = 30_000_142;
const PLANET_ID = 40_000_002;
const NEIGHBOUR_ID = 40_000_005;
const STORAGE_PLANET_ID = 40_000_006;

const TEMPERATE_TYPE_ID = 11;
const BARREN_TYPE_ID = 2016;
const MICROORGANISMS = 2073;
const BASE_METALS = 2267;

const INSTALLED_AT = '2026-09-01T00:00:00Z';
const EXPIRES_AT = '2026-09-15T00:00:00Z';

const COLONIES = [
  {
    solar_system_id: SYSTEM_ID,
    planet_id: PLANET_ID,
    planet_type: 'temperate',
    owner_id: CHARACTER_ID,
    upgrade_level: 5,
    num_pins: 7,
    last_update: '2026-09-10T00:00:00Z',
  },
  {
    solar_system_id: SYSTEM_ID,
    planet_id: STORAGE_PLANET_ID,
    planet_type: 'barren',
    owner_id: CHARACTER_ID,
    upgrade_level: 5,
    num_pins: 3,
    last_update: '2026-09-10T00:00:00Z',
  },
];

/** One extractor against four Basic factories it cannot feed. */
const COLONY_DETAIL = {
  links: [
    { source_pin_id: 1, destination_pin_id: 2, link_level: 0 },
    { source_pin_id: 1, destination_pin_id: 3, link_level: 0 },
  ],
  pins: [
    { pin_id: 1, type_id: 2254, latitude: 1, longitude: 1 }, // Command Center
    {
      pin_id: 2,
      type_id: 3068, // Extractor Control Unit
      latitude: 1.1,
      longitude: 1.1,
      extractor_details: {
        product_type_id: MICROORGANISMS,
        cycle_time: 1800,
        qty_per_cycle: 6965,
        head_radius: 0.01,
        heads: [{ head_id: 0, latitude: 1.1, longitude: 1.1 }],
      },
      install_time: INSTALLED_AT,
      expiry_time: EXPIRES_AT,
      last_cycle_start: INSTALLED_AT,
    },
    { pin_id: 3, type_id: 2256, latitude: 1.2, longitude: 1.2 }, // Launchpad
    ...[4, 5, 6, 7].map((pinId) => ({
      pin_id: pinId,
      type_id: 2473,
      latitude: 1.3,
      longitude: 1.3,
      schematic_id: 131, // Bacteria
    })),
  ],
};

/** Ten heads into one Launchpad and no factory: nothing but dig and hold. */
const STORAGE_COLONY_DETAIL = {
  links: [{ source_pin_id: 11, destination_pin_id: 13 }],
  pins: [
    { pin_id: 11, type_id: 2254, latitude: 2, longitude: 2 },
    {
      pin_id: 12,
      type_id: 3068,
      latitude: 2.1,
      longitude: 2.1,
      extractor_details: {
        product_type_id: BASE_METALS,
        cycle_time: 1800,
        qty_per_cycle: 40_000,
        head_radius: 0.02,
        heads: Array.from({ length: 10 }, (_, index) => ({
          head_id: index,
          latitude: 2.1 + index / 100,
          longitude: 2.1,
        })),
      },
      install_time: INSTALLED_AT,
      expiry_time: EXPIRES_AT,
      last_cycle_start: INSTALLED_AT,
    },
    { pin_id: 13, type_id: 2256, latitude: 2.2, longitude: 2.2 },
  ],
};

const SYSTEM = {
  system_id: SYSTEM_ID,
  name: 'Efa',
  security_status: 0.9,
  planets: [
    { planet_id: PLANET_ID },
    { planet_id: NEIGHBOUR_ID },
    { planet_id: STORAGE_PLANET_ID },
  ],
};

const PLANETS: Record<number, { name: string; type_id: number }> = {
  [PLANET_ID]: { name: 'Efa II', type_id: TEMPERATE_TYPE_ID },
  [NEIGHBOUR_ID]: { name: 'Efa IV', type_id: TEMPERATE_TYPE_ID },
  [STORAGE_PLANET_ID]: { name: 'Efa VI', type_id: BARREN_TYPE_ID },
};

test.beforeEach(async ({ page }) => {
  await loginAndSelectCharacter(page);

  // Registered after the shared fixture so these win: Playwright matches the
  // most recently added route first.
  await page.route('https://esi.evetech.net/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (pathname === `/characters/${CHARACTER_ID}/planets`) return json(COLONIES);
    if (pathname === `/characters/${CHARACTER_ID}/planets/${PLANET_ID}`) return json(COLONY_DETAIL);
    if (pathname === `/characters/${CHARACTER_ID}/planets/${STORAGE_PLANET_ID}`)
      return json(STORAGE_COLONY_DETAIL);
    if (pathname === `/universe/systems/${SYSTEM_ID}`) return json(SYSTEM);
    if (pathname === '/universe/schematics/131') {
      return json({ schematic_name: 'Bacteria', cycle_time: 1800 });
    }

    const planet = /^\/universe\/planets\/(\d+)$/.exec(pathname);
    if (planet) {
      const info = PLANETS[Number(planet[1])];
      if (info) return json({ ...info, planet_id: Number(planet[1]), system_id: SYSTEM_ID });
    }
    return route.fallback();
  });

  /*
    Every requested type comes back quoted, at a price that rises with tier so
    a made product out-earns the ore it is made from. The shared fixture
    prices one type only, which would leave every colony here unpriceable —
    and an unpriced colony contributes no rebuild advice, so the toggle this
    spec measures would never render.
  */
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body: Record<string, unknown> = {};
    for (const raw of types.split(',').filter(Boolean)) {
      const typeId = Number(raw);
      const sell = typeId === MICROORGANISMS || typeId === BASE_METALS ? 12 : 1_400;
      body[raw] = {
        buy: { max: sell * 0.9, volume: 500_000, orderCount: 40 },
        sell: { min: sell, volume: 500_000, orderCount: 40 },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // The app warms `/planets` at boot, so the shared fixture's empty answer is
  // already cached by the time the route above is registered. Drop the cached
  // rows so the colonies above are what the tab actually reads.
  await clearCachedEsiRows(page);
});

/**
 * Measured, not asserted as a class token: jsdom has no layout, which is the
 * whole reason this pair of assertions lives in e2e rather than beside the
 * component.
 */
async function chipHeight(page: Page, name: string) {
  const chip = page.getByRole('button', { name, exact: true });
  await chip.waitFor();
  return chip.evaluate((element: HTMLElement) => element.getBoundingClientRect().height);
}

async function openAdvisor(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto('/planetary-industry?tab=advisor');
  await page.getByText('Do this, best first').waitFor();
  // The toggle renders only against a rebuild candidate, so gate on it here
  // rather than inside each measurement: a timeout on this line means the
  // fixture stopped producing one, not that the sizing regressed.
  await page.getByRole('button', { name: 'Tuning only', exact: true }).waitFor();
}

test('worklist toggle reaches the touch floor on a phone (390px)', async ({ page }) => {
  await openAdvisor(page, PHONE);

  expect(await chipHeight(page, 'Tuning only')).toBeGreaterThanOrEqual(TOUCH_FLOOR);
  expect(await chipHeight(page, 'Include rebuilds')).toBeGreaterThanOrEqual(TOUCH_FLOOR);
});

test('worklist toggle keeps the compact desktop height at exactly md (768px)', async ({ page }) => {
  await openAdvisor(page, MD_EDGE);

  expect(await chipHeight(page, 'Tuning only')).toBe(DESKTOP_HEIGHT);
  expect(await chipHeight(page, 'Include rebuilds')).toBe(DESKTOP_HEIGHT);
});

test('the toggle says which worklist is showing', async ({ page }) => {
  await openAdvisor(page, PHONE);

  const tuningOnly = page.getByRole('button', { name: 'Tuning only', exact: true });
  const includeRebuilds = page.getByRole('button', { name: 'Include rebuilds', exact: true });

  // `aria-pressed`, which the hand-rolled buttons never carried: a pilot using
  // a screen reader could not hear which of the two readings was on. Tuning
  // only leads, so it is the one pressed when the tab opens.
  await expect(tuningOnly).toHaveAttribute('aria-pressed', 'true');
  await expect(includeRebuilds).toHaveAttribute('aria-pressed', 'false');

  // One reading at a time: pressing the other turns this one off.
  await includeRebuilds.click();
  await expect(includeRebuilds).toHaveAttribute('aria-pressed', 'true');
  await expect(tuningOnly).toHaveAttribute('aria-pressed', 'false');
});
