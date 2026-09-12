/**
 * The Advisor tab, rendered against a colony that has something wrong with it.
 *
 * The shared ESI fixture answers `/characters/{id}/planets` with an empty list
 * — it is warmed at boot for every scope and no spec needed rows until now —
 * so this spec overrides that route and the handful below it, which is the
 * pattern `mockEsi.ts` asks for rather than filling the fixture in for every
 * other spec.
 *
 * The colony is built to be *wrong* in the specific way the rework is about:
 * four Basic Industry Facilities against one extractor that cannot feed them.
 * That produces a removal step, which is the row a pilot should see first, and
 * it exercises the ranked list rather than the empty state.
 */
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const SYSTEM_ID = 30_000_142;
const PLANET_ID = 40_000_002;
const NEIGHBOUR_ID = 40_000_005;
const STORAGE_PLANET_ID = 40_000_006;

/** Temperate — the planet type that yields Microorganisms. */
const TEMPERATE_TYPE_ID = 11;
const BARREN_TYPE_ID = 2016;
const MICROORGANISMS = 2073;
/** Barren's P0 — what the storage colony below pulls. */
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

/**
 * One extractor against four Basic factories. The extractor's program carries
 * a full install-time baseline, so its rate is measured rather than refused —
 * and its 14-day span is what makes the peak-versus-mean buffer check bite.
 */
const COLONY_DETAIL = {
  links: [
    { source_pin_id: 1, destination_pin_id: 2, link_level: 0 },
    { source_pin_id: 1, destination_pin_id: 3, link_level: 0 },
  ],
  pins: [
    {
      pin_id: 1,
      type_id: 2254, // Command Center
      latitude: 1,
      longitude: 1,
    },
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
    // Four Basic Industry Facilities running Bacteria. Each eats 3,000
    // Microorganisms per 30-minute cycle — 24,000/hr between them — against
    // one extractor averaging well under that, so three of the four stand
    // idle. That is the fault the worklist should lead with.
    ...[4, 5, 6, 7].map((pinId) => ({
      pin_id: pinId,
      type_id: 2473,
      latitude: 1.3,
      longitude: 1.3,
      schematic_id: 131, // Bacteria
    })),
  ],
};

/**
 * A colony that does nothing but dig and hold: ten heads into one Launchpad,
 * no factory to consume any of it. It fills well inside a daily haul, which is
 * the fault the summary is meant to name planet by planet rather than count.
 */
const STORAGE_COLONY_DETAIL = {
  links: [{ source_pin_id: 11, destination_pin_id: 13 }],
  pins: [
    { pin_id: 11, type_id: 2254, latitude: 2, longitude: 2 }, // Command Center
    {
      pin_id: 12,
      type_id: 3068, // Extractor Control Unit
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
    { pin_id: 13, type_id: 2256, latitude: 2.2, longitude: 2.2 }, // Launchpad
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

    // The factories' schematic, so the card names what they make rather than
    // calling it unknown — and so the balance can price their appetite.
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
    The shared fixture prices one type (Tritanium), which leaves every colony
    here unpriceable — and an unpriced tab cannot render the figures this
    spec's screenshot exists to check: what the colonies earn now, what tuning
    adds, and what a rebuild would earn instead. So every requested type comes
    back quoted, at a price that rises with tier so a made product out-earns
    the ore it is made from.
  */
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body: Record<string, unknown> = {};
    for (const raw of types.split(',').filter(Boolean)) {
      const typeId = Number(raw);
      // P0 ore is cheap; anything made from it is worth more. The exact
      // figures do not matter — the ordering between them does.
      const sell = typeId === MICROORGANISMS || typeId === BASE_METALS ? 12 : 1_400;
      // `orderCount` is not decoration: `parseSide` reports a side with no
      // orders as null rather than 0, so an aggregate without it is an
      // unpriced type however good its `min` looks.
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

  // The shared fixture answers `/planets` with an empty list and the app warms
  // that at boot, so the empty answer is already in the ESI cache by the time
  // the route above is registered. Drop the cached rows and reload, so the
  // colony below is what the tab actually reads.
  await page.evaluate(
    async () =>
      new Promise((resolve) => {
        // Only the cache table. Deleting the database would take the tokens
        // with it and land the spec on the login screen.
        const open = indexedDB.open('neocom');
        open.onsuccess = () => {
          const database = open.result;
          if (!database.objectStoreNames.contains('esiCache')) return resolve(null);
          const tx = database.transaction('esiCache', 'readwrite');
          tx.objectStore('esiCache').clear();
          tx.oncomplete = () => resolve(null);
          tx.onerror = () => resolve(null);
        };
        open.onerror = () => resolve(null);
      })
  );

  await page.goto('/planetary-industry?tab=advisor');
});

test('leads with one ranked list of what to do, across planets', async ({ page }) => {
  await expect(page.getByText('Do this, best first')).toBeVisible();

  // The fault, not a capacity figure: four factories one extractor cannot feed.
  await expect(page.getByText(/nothing feeds them/).first()).toBeVisible();
  // Its value is budget handed back, stated in its own units rather than as ISK.
  await expect(page.getByText(/frees [\d,]+ tf/).first()).toBeVisible();
});

test('asks how often the pilot restarts extractors and hauls, as two questions', async ({
  page,
}) => {
  // By role, not by label: each control's info tooltip carries an
  // "About <label>" button that a bare label query also matches.
  await expect(page.getByRole('combobox', { name: 'I restart extractors every' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'I haul from the planet every' })).toBeVisible();
});

test('says what it cannot answer rather than leaving a silent gap', async ({ page }) => {
  await expect(page.getByText('What the Advisor cannot see')).toBeVisible();
});

/**
 * Not an assertion — the artifact. The rework is a layout change, and a
 * screenshot is the only thing that shows whether the page reads as one
 * ranked list rather than a wall of cards.
 */
test('captures the reworked tab', async ({ page }) => {
  await page.getByText('Do this, best first').waitFor();
  await page.screenshot({ path: 'e2e-output/pi-advisor.png', fullPage: true });
});
