import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useAuthFailure } from '@/stores/authFailure';
import { DEFAULT_PI_CADENCE, PI_CADENCE_KEY, useCadence } from '@/features/pi/cadencePref';
import {
  useShowAltColonies,
  DEFAULT_PI_COLONIES_SHOW_ALTS,
  PI_COLONIES_SHOW_ALTS_KEY,
} from '@/features/pi/showAltColoniesPref';
import { App } from '@/app/App';
import { piTier } from '@/engine/pi/chain';
import * as routeChunks from '@/app/routeChunks';
import { loadPlanPrices } from '@/features/pi/planPrices';
import type { PiData } from '@/sde/types';

/** A P1 a temperate colony makes from its own Aqueous Liquids. */
const WATER = 3645;
const WATER_NAME = 'Water';
/** A P2 — the Industry "PI Plan" link's far end seeds it as a goal. */
const TRANSMITTER = 9840;
const TRANSMITTER_NAME = 'Transmitter';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// The Plan tab needs the real recipe graph — its numbers are claims about the
// shipped `pi.json`, so a stub would pin nothing. Everything else this route
// never reads. Planet radius: so the colony's one link can be costed.
const piData = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => piData),
  loadPiPlanetRadius: vi.fn(async () => ({ [String(40000001)]: 5_000 })),
  // The product drawer's planet finder: no systems needed for these tests.
  loadPiSystemPlanets: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

// The one price path, stubbed at the feature seam: `loadMarketSnapshot` goes
// to Fuzzwork, which this suite's MSW server (`onUnhandledRequest: 'error'`)
// rightly refuses. The real path is covered by `planPrices.test.ts`.
vi.mock('@/features/pi/planPrices', () => ({
  // Every requested type at a flat price per tier, both sides of the book:
  // the Baseline needs a bid for every P1 a colony could make.
  loadPlanPrices: vi.fn(async (_hub: unknown, typeIds: number[]) => {
    const prices: Record<number, number> = {};
    const buyPrices: Record<number, number> = {};
    for (const typeId of typeIds) {
      const price = [5, 760, 14_000, 100_000, 1_900_000][piTier(typeId, piData)];
      prices[typeId] = price;
      buyPrices[typeId] = price * 0.95;
    }
    return { prices, buyPrices, unpriced: [], failed: false, fetchedAt: new Date() };
  }),
}));

// Jumps to the hub: the real count walks a stargate snapshot this suite does
// not serve. The planner's own wiring is what is under test here.
// One basis object for every render, as the real hook memoises it: a fresh
// object each render would re-run the planner's distance effect every time.
const JUMP_BASIS = vi.hoisted(() => ({
  rules: {},
  network: {},
  key: 'test',
  hydrated: true,
  podKillsUnavailable: false,
}));
vi.mock('@/features/route/jumpBasis', () => ({
  useJumpBasis: () => JUMP_BASIS,
  jumpsBetween: vi.fn(async () => ({ kind: 'known', jumps: 7 })),
}));

const CHAR_ID = 91;
const ESI = 'https://esi.evetech.net';
const PLANET_ID = 40000001;
const SYSTEM_ID = 30000142;

const planetsPayload = [
  {
    solar_system_id: SYSTEM_ID,
    planet_id: PLANET_ID,
    planet_type: 'temperate' as const,
    owner_id: CHAR_ID,
    last_update: '2026-08-30T00:00:00Z',
    upgrade_level: 3,
    num_pins: 1,
  },
];

// Well in the past relative to "today" in this test environment, so the
// extractor always reads as expired regardless of when the suite runs.
const EXPIRED_TIME = '2020-01-01T00:00:00Z';

const detailPayload = {
  links: [],
  pins: [
    {
      pin_id: 1,
      type_id: 2848,
      latitude: 0,
      longitude: 0,
      expiry_time: EXPIRED_TIME,
      extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
    },
  ],
  routes: [],
};

const PRODUCT_ID = 2307; // Felsic Magma in pi.json
const FACTORY_TYPE_ID = 3001;
const STORAGE_TYPE_ID = 3002;
const SCHEMATIC_ID = 131;

const NAMES: Record<number, { name: string; category: string }> = {
  [SYSTEM_ID]: { name: 'Jita', category: 'solar_system' },
  2848: { name: 'Extractor Control Unit', category: 'inventory_type' },
  [PRODUCT_ID]: { name: 'Felsic Magma', category: 'inventory_type' },
  [FACTORY_TYPE_ID]: { name: 'Basic Industry Facility', category: 'inventory_type' },
  [STORAGE_TYPE_ID]: { name: 'Storage Facility', category: 'inventory_type' },
};

/**
 * No extractor at all — two factory pins sharing a schematic, one storage
 * pin — for the Production/Infrastructure cards, which the base
 * `detailPayload` (a lone extractor) never exercises.
 */
const roleCardsDetailPayload = {
  links: [],
  routes: [],
  pins: [
    { pin_id: 10, type_id: FACTORY_TYPE_ID, latitude: 0, longitude: 0, schematic_id: SCHEMATIC_ID },
    { pin_id: 11, type_id: FACTORY_TYPE_ID, latitude: 0, longitude: 0, schematic_id: SCHEMATIC_ID },
    { pin_id: 12, type_id: STORAGE_TYPE_ID, latitude: 0, longitude: 0 },
  ],
};

/**
 * A colony one day into CCP's worked 14-day program (qty_per_cycle 6,965 on a
 * 30-minute cycle), built off a timestamp captured before the route loads so
 * the loader's own `loadedAt` is always at or after it. The extra minute of
 * install age absorbs the test's runtime: elapsed stays inside cycle 48 —
 * 24h to 24.5h — so the banked figure is the deterministic 513,262 of
 * `extraction.test.ts`, not a value that drifts with wall-clock timing.
 *
 * A day in is *not* decayed: `EFFICIENT_WINDOW_FRACTION` reads a trailing day
 * of output against the program's first day, and one day in those are the same
 * day. `decayedDetailPayload` below is the aged one.
 */
const BASE_NOW = Date.now();
const DAY_MS = 86_400_000;

const agedDetailPayload = {
  links: [],
  pins: [
    {
      pin_id: 2,
      type_id: 2848,
      latitude: 0,
      longitude: 0,
      install_time: new Date(BASE_NOW - DAY_MS - 60_000).toISOString(),
      expiry_time: new Date(BASE_NOW + 13 * DAY_MS).toISOString(),
      extractor_details: {
        heads: [{ head_id: 1, latitude: 0, longitude: 0 }],
        product_type_id: PRODUCT_ID,
        qty_per_cycle: 6965,
        cycle_time: 1800,
      },
    },
  ],
  routes: [],
};

/**
 * The same program five days in, where its trailing day runs at 24% of its
 * first — under `EFFICIENT_WINDOW_FRACTION` — with expiry still nine days off,
 * so the colony is decayed without being idle or expiring-soon.
 */
const decayedDetailPayload = {
  ...agedDetailPayload,
  pins: [
    {
      ...agedDetailPayload.pins[0],
      install_time: new Date(BASE_NOW - 5 * DAY_MS - 60_000).toISOString(),
      expiry_time: new Date(BASE_NOW + 9 * DAY_MS).toISOString(),
    },
  ],
};

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json(planetsPayload)),
  http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
    HttpResponse.json(detailPayload)
  ),
  http.get(`${ESI}/universe/planets/${PLANET_ID}`, () =>
    HttpResponse.json({
      planet_id: PLANET_ID,
      name: 'Jita IV',
      system_id: SYSTEM_ID,
      type_id: 11,
      position: { x: 0, y: 0, z: 0 },
    })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json({
      skills: [
        {
          skill_id: 33467,
          trained_skill_level: 4,
          active_skill_level: 4,
          skillpoints_in_skill: 90510,
        },
      ],
      total_sp: 90510,
    })
  ),
  http.post(`${ESI}/universe/names`, async ({ request }) => {
    const ids = (await request.json()) as number[];
    return HttpResponse.json(ids.filter((id) => NAMES[id]).map((id) => ({ id, ...NAMES[id] })));
  }),
  // The planner's item menus (Quickbar) read the character's public profile.
  http.get(`${ESI}/characters/${CHAR_ID}/corporationhistory`, () => HttpResponse.json([])),
  http.get(`${ESI}/universe/systems/${SYSTEM_ID}`, () =>
    HttpResponse.json({
      system_id: SYSTEM_ID,
      name: 'Jita',
      security_status: 0.95,
      constellation_id: 20000020,
      star_id: 40009076,
    })
  )
);

/**
 * A colony the planner can fit against: one measured ECU on Aqueous Liquids
 * linked to its Launchpad, so its link cost is measured rather than refused.
 */
const plannableDetailPayload = {
  links: [{ source_pin_id: 3, destination_pin_id: 2, link_level: 0 }],
  routes: [],
  pins: [
    {
      ...agedDetailPayload.pins[0],
      latitude: 0.2,
      longitude: 0.4,
      extractor_details: {
        ...agedDetailPayload.pins[0].extractor_details,
        heads: Array.from({ length: 6 }, (_, i) => ({ head_id: i, latitude: 0, longitude: 0 })),
        product_type_id: 2268,
      },
    },
    { pin_id: 3, type_id: 2256, latitude: 0.5, longitude: 0.9 },
  ],
};

async function resetSession(): Promise<void> {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  // Module-scope stores: without a reset, a choice one test makes is the state
  // the next one opens on.
  useShowAltColonies.setState({ value: DEFAULT_PI_COLONIES_SHOW_ALTS, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-planets.manage_planets.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/planetary-industry/colonies');
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // One throwaway render of the page, so no test pays for a worker's first
  // cold `App` render (lazy route chunks, jsdom, React warm-up) — the pattern
  // `IndustryPlanPage.test.tsx` uses, under this hook's own budget.
  await routeChunks.loadPlanetaryIndustry();
  await resetSession();
  window.history.pushState({}, '', '/planetary-industry/plan');
  const { unmount } = render(<App />);
  await screen.findByRole('heading', { name: 'What do you want to do?' }, { timeout: 25_000 });
  unmount();
  server.resetHandlers();
}, 30_000);
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  useAuthFailure.setState({ failure: null });
  // The haul cadence persists like any setting: a test that changes it must not set the next one's window.
  await db.settings.delete(PI_CADENCE_KEY);
  useCadence.setState({ value: DEFAULT_PI_CADENCE, hydrated: false });
  await resetSession();
});

const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';

async function addAlt(characterId: number, name: string, scopes: string[]) {
  await db.characters.put({
    characterId,
    name,
    ownerHash: `oh${characterId}`,
    addedAt: characterId,
  });
  await db.tokens.put({
    characterId,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes,
  });
}

/**
 * The per-colony row+drilldown wrapper for a planet, found by its own
 * heading and expanded (clicked open) if it wasn't already: a collapsed row
 * carries the status, the meters and one action, and the per-extractor,
 * production and launchpad detail only mounts once the row's region is open.
 *
 * The Today panel above the list names the same planets and states, so a
 * page-wide `getByText` is ambiguous here by design. An assertion about one
 * colony therefore says which row it means rather than loosening its counts.
 */
async function colonyPanelFor(name: RegExp): Promise<HTMLElement> {
  // The page's load has settled (its Refresh button re-enables): a row can draw
  // from the first, detail-less snapshot and then redraw as the pins arrive.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  const heading = await screen.findByRole('heading', { name });
  const panel = heading.closest('[data-colony-status]');
  if (!(panel instanceof HTMLElement)) throw new Error(`no colony panel for ${String(name)}`);
  // The row's toggle, not the "more actions" menu or the primary action: those
  // carry their own accessible names.
  const trigger = within(panel).getByRole('button', { name: /^Show details for / });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  await within(panel).findByRole('region');
  return panel;
}

/** The whole Colonies panel (every character's rows once the toggle is on), found by its own "N colony/colonies" header — as opposed to `colonyPanelFor`'s single-colony wrapper. */
function coloniesPanel(): HTMLElement {
  const heading = screen.getByRole('heading', { name: /^\d+ colon(y|ies)$/i });
  const panel = heading.closest('section');
  if (!(panel instanceof HTMLElement)) throw new Error('no colonies panel found');
  return panel;
}

describe('PlanetaryIndustry', () => {
  it('lists a colony with its planet, and shows the extractor as stopped from expiry_time alone', async () => {
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(panel).toHaveAttribute('data-colony-status', 'stopped');
    // The planet is a Route Safety link, the status a word (never colour alone).
    expect(within(panel).getByRole('link', { name: 'Jita IV' })).toHaveAttribute(
      'href',
      expect.stringContaining('/travel/route')
    );
    expect(within(panel).getByText('Stopped', { selector: 'span' })).toBeInTheDocument();
    // Its one action is a restart, and says what it is without a figure when
    // the model has none to give.
    expect(within(panel).getByRole('button', { name: /^Restart/ })).toBeInTheDocument();
    // Unlabelled product: the extractor names no product, so the row says so
    // rather than guessing one.
    expect(within(panel).getAllByText('Unknown product').length).toBeGreaterThan(0);
  });

  it("explains what the page can't see, in plain words", async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(
      screen.getByText(/the game only updates a colony's storage and extractors/)
    ).toBeInTheDocument();
  });

  it('reads a colony with no readable extraction program as unknown storage, never blank', async () => {
    // The fixture's one extractor pin carries no install-time baseline, so
    // `colonyHoursToFull` cannot measure it: the row must still say so rather
    // than showing nothing, which a pilot could misread as "safe".
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText("Can't tell yet")).toBeInTheDocument();
  });

  it('leads with the next thing to do, and when to log in', async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const heading = screen.getByRole('heading', { name: "Today's check" });
    const today = heading.closest('section');
    if (!(today instanceof HTMLElement)) throw new Error('no Today panel');
    // The one stopped colony is due now.
    expect(within(today).getByText(/^Restart Jita IV/)).toBeInTheDocument();
    expect(within(today).getByText('Log in next')).toBeInTheDocument();
    expect(within(today).getByText('Now')).toBeInTheDocument();
    expect(within(today).getAllByText('Stopped').length).toBeGreaterThan(0);
    // Display only: the planet strip is not a row of controls.
    expect(within(today).queryAllByRole('button', { name: /Jita IV/ })).toHaveLength(0);
  });

  it('names the haul cadence beside the log-in time, and changes it from there', async () => {
    const user = userEvent.setup();
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const today = screen
      .getByRole('heading', { name: "Today's check" })
      .closest('section') as HTMLElement;
    await user.click(within(today).getByRole('combobox', { name: 'You haul' }));
    await user.click(await screen.findByRole('option', { name: 'once a week' }));
    await waitFor(() =>
      expect(within(today).getByRole('combobox', { name: 'You haul' })).toHaveTextContent(
        'once a week'
      )
    );
  });

  it('shows the empty state when there are no colonies', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
    render(<App />);
    expect(await screen.findByText('No colonies yet')).toBeInTheDocument();
    // The way out: Plan, where "what should I build" lives.
    expect(screen.getByRole('link', { name: /Find the best thing to build/ })).toHaveAttribute(
      'href',
      '/planetary-industry/plan'
    );
  });

  it('shows a re-login prompt when the planets scope itself was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your colonies')).toBeInTheDocument();
  });

  it('shows the alt-colonies toggle alongside the re-login prompt, not instead of it, when an alt has cached colonies', async () => {
    // The active Character's own live load 403s...
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    // ...but an alt's colonies are already cached from a prior visit as that
    // character — exactly the case a cross-character surface exists for.
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: detailPayload,
      fetchedAt: Date.now(),
    });

    render(<App />);

    // The banner is not a substitute for the panel: both render.
    expect(
      (await screen.findAllByText('Log in again to see your colonies')).length
    ).toBeGreaterThan(0);
    const toggle = await screen.findByRole('button', { name: /show \d+ alt/i });

    const user = userEvent.setup();
    await user.click(toggle);
    // No `universe/planets/{id}` mock is registered for the alt's planet in
    // this test, so it renders its "Planet #id" fallback — a real row for a
    // real (if unnamed) colony, not an error state.
    const altRow = screen.getByRole('button', {
      name: new RegExp(`^Show details for Planet #${ALT_PLANET_ID}`),
    });
    expect(altRow).toHaveAttribute('aria-expanded', 'false');

    // Expanding an alt's row exercises the composite `${characterId}:${planetId}`
    // key and DOM ids end to end, not just that the row renders collapsed.
    await user.click(altRow);
    expect(altRow).toHaveAttribute('aria-expanded', 'true');
    expect(within(coloniesPanel()).getByRole('region')).toBeInTheDocument();
  });

  it("opens a colony's ⋮ menu by right-click on the row too, but leaves its links to the browser", async () => {
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    const row = within(panel)
      .getByRole('button', { name: /^Show details for / })
      .closest('[data-colony-status] > div');
    if (!row) throw new Error('no row');
    // A right-click on the planet link stays the browser's link menu (DESIGN.md §6c "Entities").
    const link = within(panel).getAllByRole('link')[0];
    const onLink = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    link.dispatchEvent(onLink);
    expect(onLink.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    fireEvent.contextMenu(row);
    expect(await screen.findByRole('menuitem', { name: 'Hide details' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Plan this colony' })).toBeInTheDocument();
  });

  it('leaves both yield figures blank for an extractor with no install-time baseline', async () => {
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // The fixture's pin has an expiry but no qty_per_cycle/cycle_time/
    // install_time, so Banked and Reset now are em-dashed, never a zero, which
    // would read as "this program has produced nothing".
    const region = within(panel).getByRole('region');
    expect(within(region).getAllByText('—')).toHaveLength(2);
    expect(within(panel).queryByText('0 (0%)')).not.toBeInTheDocument();
  });

  it('shows banked yield, its share of the program, and the daily gain from resetting now', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(agedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('513,262 (27%)')).toBeInTheDocument();
    expect(within(panel).getByText('+793,859 units/day')).toBeInTheDocument();
    const region = within(panel).getByRole('region');
    expect(within(region).queryByText('—')).not.toBeInTheDocument();
  });

  it('flags a colony whose extractors are all past the efficient window as needing a look', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // Five days in, a trailing day of output runs at ~24% of the program's
    // first day, under EFFICIENT_WINDOW_FRACTION, while expiry is still nine
    // days out: neither stopped nor expiring soon, but worth a trip.
    expect(panel).toHaveAttribute('data-colony-status', 'needs-look');
    expect(within(panel).getByText('Needs a look')).toBeInTheDocument();
    expect(within(panel).getByText(/slowed to \d+% of its first day/)).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Stopped', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('leaves a colony one day into its program healthy, not needing a look', async () => {
    // The regression #316 exists for: on the old per-cycle read this colony
    // wore the badge four hours in, with 6% of a fortnight's output banked.
    // With a launchpad to hold it: a colony with nowhere to store anything
    // fills at once, which is its own "needs a look".
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json({
          ...agedDetailPayload,
          pins: [
            ...agedDetailPayload.pins,
            { pin_id: 3, type_id: 2256, latitude: 0.5, longitude: 0.9 },
          ],
        })
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(panel).toHaveAttribute('data-colony-status', 'healthy');
    expect(within(panel).getByText('Healthy')).toBeInTheDocument();
    expect(within(panel).queryByText('Needs a look')).not.toBeInTheDocument();
  });

  it('names each extractor by its product, as a link to its PI detail, not by the extractor pin type', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    const region = within(panel).getByRole('region');
    // "Extractor Control Unit" (the pin type) reads identically on every
    // extractor and identifies nothing; the resolved product is what names it.
    expect(within(region).getByRole('link', { name: 'Felsic Magma' })).toHaveAttribute(
      'href',
      `/planetary-industry/map?product=${PRODUCT_ID}`
    );
    expect(within(panel).queryByText('Extractor Control Unit')).not.toBeInTheDocument();
  });

  it('groups factory pins into one Production row per schematic, with a facility count', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(roleCardsDetailPayload)
      ),
      http.get(`${ESI}/universe/schematics/${SCHEMATIC_ID}`, () =>
        HttpResponse.json({ schematic_name: 'Plasmoids', cycle_time: 1800 })
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    const region = within(panel).getByRole('region');
    // Two Basic Industry Facility pins running the same schematic collapse
    // into one row, not two identical ones.
    expect(within(region).getByText('Plasmoids')).toBeInTheDocument();
    expect(within(region).getByText(/^2×/)).toBeInTheDocument();
  });

  it('shows an unknown status rather than a confident Healthy when a colony detail failed to load', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () => HttpResponse.error())
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(panel).toHaveAttribute('data-colony-status', 'unknown');
    expect(within(panel).getByText('Unknown', { selector: 'span' })).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
  });

  it('pairs the no-pin-data title with a hint on why it happened, not just the title alone', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () => HttpResponse.error())
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('No pin data cached for this colony')).toBeInTheDocument();
    expect(
      within(panel).getByText("Refresh to fetch this colony's deployed pins.")
    ).toBeInTheDocument();
  });

  it("lists an alt's cached programs beside the active character's, without fetching for it", async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    const altPlanetsFetch = vi.fn();
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    // Cached on a previous visit to this page as that character. Page open
    // must read it, not re-fetch it.
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: {
        links: [],
        routes: [],
        pins: [
          {
            pin_id: 9,
            type_id: 2848,
            latitude: 0,
            longitude: 0,
            expiry_time: new Date(BASE_NOW + 5 * DAY_MS).toISOString(),
            extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
          },
        ],
      },
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`${ESI}/characters/${ALT_ID}/planets`, () => {
        altPlanetsFetch();
        return HttpResponse.json([]);
      })
    );

    const { unmount } = render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    // Grouped by character: the active Character's own group heading plus
    // the alt's, each above that character's colony rows. Scoped to the
    // colonies panel — "Pilot One" is also the active Character's own name
    // in the nav rail.
    const panel = coloniesPanel();
    expect(within(panel).getByText('Pilot One')).toBeInTheDocument();
    expect(within(panel).getByText('Alt Two')).toBeInTheDocument();
    expect(altPlanetsFetch).not.toHaveBeenCalled();

    // And the choice survives leaving the page. The alt roster is loaded
    // unconditionally and cache-only, so remembering "on" costs no extra
    // request — `altPlanetsFetch` is still untouched on the second visit.
    unmount();
    useShowAltColonies.setState({ hydrated: false });
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(await within(coloniesPanel()).findByText('Alt Two')).toBeInTheDocument();
    expect(altPlanetsFetch).not.toHaveBeenCalled();
    expect((await db.settings.get(PI_COLONIES_SHOW_ALTS_KEY))?.value).toBe(true);
  });

  it('skips an alt without the planets scope: no ESI call, no re-auth banner', async () => {
    const SCOPELESS_ID = 93;
    const scopelessFetch = vi.fn();
    await addAlt(SCOPELESS_ID, 'Scopeless Alt', ['esi-skills.read_skills.v1']);
    server.use(
      http.get(`${ESI}/characters/${SCOPELESS_ID}/planets`, () => {
        scopelessFetch();
        return HttpResponse.json({ error: 'missing scope' }, { status: 403 });
      })
    );

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    expect(scopelessFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Scopeless Alt/)).toHaveTextContent(/no planetary access/i);
    // The trap this guards: a live 403 on an alt raises the app-wide re-auth
    // banner, naming a character the player never asked about.
    expect(screen.queryByText('Log in again to see your colonies')).not.toBeInTheDocument();
  });

  it('shows the page banner for a planets refusal another reader recorded', async () => {
    useAuthFailure.getState().reportRequestFailure(CHAR_ID, 'getCharacterPlanets');
    render(<App />);
    expect(await screen.findByText('Log in again to see your colonies')).toBeInTheDocument();
    expect(screen.queryByText('EVE access was refused')).not.toBeInTheDocument();
  });

  it('keeps the colony view on the default tab, with no URL param needed', async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(screen.getByRole('tab', { name: 'Colonies' })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toBe('');
  });

  it('opens the planner on the Plan tab and records it in the URL', async () => {
    const user = userEvent.setup();
    render(<App />);
    await colonyPanelFor(/Jita IV/);

    await user.click(screen.getByRole('tab', { name: 'Plan' }));

    // A pilot with colonies is asked what to do with them; the planner is one answer.
    await user.click(await screen.findByRole('button', { name: /Make a specific product/ }));
    await screen.findByRole('heading', { name: 'Goals' });
    expect(window.location.pathname).toBe('/planetary-industry/plan');
    // The colony surface is a peer view, not a section below the planner.
    expect(screen.queryByRole('heading', { name: /Jita IV/ })).not.toBeInTheDocument();
  });

  it('seeds a goal from the Industry "PI Plan" link and clears ?type=', async () => {
    window.history.pushState({}, '', `/planetary-industry/plan?type=${TRANSMITTER}`);
    render(<App />);

    expect(await screen.findByLabelText(`${TRANSMITTER_NAME} per day`)).toHaveValue('10');
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(window.location.search).toBe(`?goals=${TRANSMITTER}%3A10`));
  });

  it("keeps the browser's link menu on a goal's name and moves the item menu behind a visible ⋮", async () => {
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${TRANSMITTER}:10`);
    render(<App />);
    await screen.findByLabelText(`${TRANSMITTER_NAME} per day`);
    const goals = screen.getByRole('list', { name: 'Goals' });
    const name = within(goals).getByRole('link', { name: TRANSMITTER_NAME });
    const onName = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    name.dispatchEvent(onName);
    expect(onName.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    // The × folded into the ⋮ (DESIGN.md §6c: never a destructive × beside a ⋮).
    expect(
      within(goals).queryByRole('button', { name: `Remove ${TRANSMITTER_NAME}` })
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      within(goals).getByRole('button', { name: `More actions for ${TRANSMITTER_NAME}` })
    );
    await user.click(await screen.findByRole('menuitem', { name: `Remove ${TRANSMITTER_NAME}` }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('drops a ?type= the planner cannot plan rather than seeding it', async () => {
    // Aqueous Liquids is a P0: extracted, never a goal.
    window.history.pushState({}, '', '/planetary-industry/plan?type=2268');
    render(<App />);

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByLabelText(/per day$/)).not.toBeInTheDocument();
  });

  it('opens the colony a ?colony= link names on the Colonies tab', async () => {
    window.history.pushState({}, '', `/planetary-industry/colonies?colony=${PLANET_ID}`);
    render(<App />);

    const row = (await screen.findByRole('heading', { name: /Jita IV/ })).closest(
      '[data-colony-status]'
    ) as HTMLElement;
    expect(within(row).getByRole('button', { name: /^Show details for / })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it("plans the URL's goals over the colony: Lift first, then the change list", async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(plannableDetailPayload)
      )
    );
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${WATER}:24`);
    render(<App />);

    // The plan is computed off deferred inputs, so the Lift lands a render later.
    const headline = await screen.findByTestId('goal-plan-headline');
    await waitFor(() => expect(headline).toHaveTextContent(/selling each colony.s best P1/));
    expect(within(headline).getByText(/^ISK\/day vs/)).toBeInTheDocument();
    expect(screen.getByLabelText(`${WATER_NAME} per day`)).toHaveValue('24');
    const changes = screen.getByRole('heading', { name: 'Changes' });
    // DOM order, not a visual reorder: this is the phone's reading order.
    expect(
      screen.getByRole('heading', { name: 'Plan' }).compareDocumentPosition(changes) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Colonies fold away below `md` (jsdom matches no media query): open them.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show colonies' }));
    // The colony's customs is its system's highsec rate after level 4.
    expect(
      screen.getByLabelText(
        'Customs tax (POCO/Skyhook) for Jita IV (applies to all colonies in Jita)'
      )
    ).toHaveValue('6');
    const flow = screen.getByRole('table', { name: 'Everything the goals need, by tier' });
    // Its rows' item menu is behind a visible ⋮, not right-click alone (DESIGN.md §6c "Rows").
    expect(
      within(flow).getByRole('button', { name: `More actions for ${WATER_NAME}` })
    ).toBeInTheDocument();
  });

  it('lists a colony it cannot cost, left out with the reason', async () => {
    // The base fixture's colony has no link to measure and no other colony to
    // borrow one from.
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${WATER}:24`);
    render(<App />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show colonies' }));
    expect(
      await screen.findByText(/Left out: no link on any of your colonies/)
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Jita IV/ })).toBeDisabled();
  });

  it('falls back to the Plan tab rather than crashing on a tab it does not know', async () => {
    window.history.pushState({}, '', '/planetary-industry/nonsense?type=not-a-number');
    render(<App />);
    await screen.findByRole('heading', { name: 'What do you want to do?' });
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on Plan, with the tabs in Plan, Map, Colonies order', async () => {
    window.history.pushState({}, '', '/planetary-industry');
    render(<App />);
    await screen.findByRole('heading', { name: 'What do you want to do?' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Plan',
      'Map',
      'Colonies',
    ]);
    expect(window.location.pathname).toBe('/planetary-industry/plan');
  });

  it('opens Plan on "Make more from my planets" when the pilot has colonies, and says why', async () => {
    window.history.pushState({}, '', '/planetary-industry/plan');
    render(<App />);
    const option = await screen.findByRole('button', { name: /Make more from my planets/ });
    expect(option).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByText(/Opened “Make more from my planets” because we found 1 colony/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
  });

  it('opens Plan on "Find the best thing to build" when there are no colonies', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
    window.history.pushState({}, '', '/planetary-industry/plan');
    render(<App />);
    const option = await screen.findByRole('button', { name: /Find the best thing to build/ });
    expect(option).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(/You have no colonies yet, so we opened/)).toBeInTheDocument();
  });

  it('restores the question from ?q= on load', async () => {
    window.history.pushState({}, '', '/planetary-industry/plan?q=find-best');
    render(<App />);
    const option = await screen.findByRole('button', { name: /Find the best thing to build/ });
    expect(option).toHaveAttribute('aria-current', 'true');
  });

  it('ignores a junk ?q= and opens on the default question', async () => {
    window.history.pushState({}, '', '/planetary-industry/plan?q=bogus');
    render(<App />);
    const option = await screen.findByRole('button', { name: /Make more from my planets/ });
    expect(option).toHaveAttribute('aria-current', 'true');
  });

  it('opens the Goal Planner on #customs, and a pick writes ?q= and drops the hash', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/planetary-industry/plan#customs');
    render(<App />);
    await screen.findByRole('heading', { name: 'Goals' });
    await user.click(screen.getByRole('button', { name: /Find the best thing to build/ }));
    expect(window.location.search).toBe('?q=find-best');
    expect(window.location.hash).toBe('');
    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
  });

  it('writes the picked question to ?q= without adding history entries', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/planetary-industry/plan');
    const before = window.history.length;
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Find the best thing to build/ }));
    expect(window.location.search).toBe('?q=find-best');
    expect(window.history.length).toBe(before);
  });

  it('keeps the Goal Planner behind a ?goals= link, with no picker choice needed', async () => {
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${WATER}:24`);
    render(<App />);
    await screen.findByRole('heading', { name: 'Goals' });
    expect(
      screen.getByText('Opened “Make a specific product” because your link names a product.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Make a specific product/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByLabelText(`${WATER_NAME} per day`)).toHaveValue('24');
  });

  it('opens the 60-second explainer from "New to PI?" on every tab', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/planetary-industry/colonies');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'New to PI?' }));
    expect(
      await screen.findByRole('dialog', { name: /New to PI\? The 60-second explainer/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Skyhook (nullsec only)')).toBeInTheDocument();
  });

  describe('with hub prices unavailable', () => {
    const NOTICE = 'Hub prices could not be fetched';
    beforeEach(() => {
      vi.mocked(loadPlanPrices).mockResolvedValueOnce({
        prices: {},
        buyPrices: {},
        unpriced: [],
        failed: true,
        fetchedAt: new Date(),
      });
    });

    it('says so on Plan, with no zero figures', async () => {
      window.history.pushState({}, '', '/planetary-industry/plan');
      render(<App />);
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
      expect(screen.queryByText(/\+0 ISK/)).toBeNull();
      expect(screen.queryByText(/Haul 0/)).toBeNull();
      expect(screen.queryByText(/can't measure this colony/)).toBeNull();
    });

    it('says so on Map instead of drawing without it', async () => {
      window.history.pushState({}, '', '/planetary-industry/map');
      render(<App />);
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    });

    it('says so on Colonies, keeps the status rows, and shows no ISK/day', async () => {
      render(<App />);
      const panel = await colonyPanelFor(/Jita IV/);
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
      expect(panel).toHaveAttribute('data-colony-status', 'stopped');
      expect(screen.queryByText(/0\.00 ISK/)).toBeNull();
    });
  });

  describe('when ESI does not answer the planets read (issue #2691)', () => {
    const NOTICE = "ESI didn't answer";
    const down = () =>
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 })
      );

    it.each([
      ['plan', '/planetary-industry/plan'],
      ['map', '/planetary-industry/map'],
      ['colonies', '/planetary-industry/colonies'],
    ])(
      'says so on %s, never "no colonies", and Retry re-reads',
      async (_tab, path) => {
        server.use(down());
        window.history.pushState({}, '', path);
        const user = userEvent.setup();
        render(<App />);
        expect(await screen.findByText(NOTICE, {}, { timeout: 15_000 })).toBeInTheDocument();
        expect(screen.queryByText('No colonies yet')).toBeNull();
        expect(screen.queryByText(/no colonies yet/i)).toBeNull();
        expect(screen.queryByText(/Reconnect/)).toBeNull();
        if (_tab === 'map') {
          expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
        }

        server.resetHandlers();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByText(NOTICE)).toBeNull(), { timeout: 15_000 });
      },
      30_000
    );

    it('keeps a warm cache on screen instead of the notice', async () => {
      await db.esiCache.put({
        characterId: CHAR_ID,
        key: 'planets',
        value: planetsPayload,
        fetchedAt: 1234,
      });
      server.use(down());
      render(<App />);
      await colonyPanelFor(/Jita IV/);
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it('still says "no colonies" for an answer that really is empty', async () => {
      server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
      render(<App />);
      expect(await screen.findByText('No colonies yet')).toBeInTheDocument();
      expect(screen.queryByText(NOTICE)).toBeNull();
    });
  });

  it('draws the planet map on the Map tab', async () => {
    window.history.pushState({}, '', '/planetary-industry/map');
    render(<App />);
    expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('The PI map is coming')).toBeNull();
  });

  describe("a product's PI detail is a URL (?product=)", () => {
    const BIOFUELS = 2396;
    const drawer = () => screen.findByRole('dialog', { name: /^(How to make|Where to get) / });

    it('opens the Map with that product drawer open, and a reload reopens it', async () => {
      window.history.pushState({}, '', `/planetary-industry/map?product=${BIOFUELS}`);
      const first = render(<App />);
      expect(within(await drawer()).getByText('Biofuels', { selector: 'div' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
      first.unmount();
      render(<App />);
      expect(within(await drawer()).getByText('Biofuels', { selector: 'div' })).toBeInTheDocument();
    });

    it('carries View in Market and Show info, the destinations the name link displaced', async () => {
      window.history.pushState({}, '', `/planetary-industry/map?product=${BIOFUELS}`);
      render(<App />);
      const dialog = await drawer();
      expect(within(dialog).getByRole('link', { name: 'View in Market' })).toHaveAttribute(
        'href',
        expect.stringContaining('/market/browser')
      );
      expect(within(dialog).getByRole('button', { name: 'Show info' })).toBeInTheDocument();
    });

    it('closes on Back: a tile click pushes the entry, Back pops it', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/planetary-industry/map');
      render(<App />);
      const board = await screen.findByRole('group', { name: /^Planet map/ });
      const tile = within(board).getByRole('link', { name: /^Biofuels\. / });
      expect(tile).toHaveAttribute('href', `/planetary-industry/map?product=${BIOFUELS}`);
      await user.click(tile);
      await drawer();
      expect(window.location.search).toBe(`?product=${BIOFUELS}`);
      window.history.back();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(window.location.pathname).toBe('/planetary-industry/map');
      expect(window.location.search).toBe('');
    });

    it.each(['999999999', 'abc', '-1'])('ignores a junk product id (%s)', async (junk) => {
      window.history.pushState({}, '', `/planetary-industry/map?product=${junk}`);
      render(<App />);
      expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
      await waitFor(() => expect(window.location.search).not.toContain('product'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it("keeps Plan's ?q= beside ?product=: a name on Plan opens the drawer, Back returns to the question", async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/planetary-industry/plan?q=find-best');
      render(<App />);
      const link = await waitFor(() => {
        const found = document.querySelector<HTMLAnchorElement>('main a[href*="product="]');
        expect(found).not.toBeNull();
        return found!;
      });
      expect(link.getAttribute('href')).toMatch(
        /^\/planetary-industry\/map\?q=find-best&product=\d+$/
      );
      await user.click(link);
      await drawer();
      expect(window.location.search).toMatch(/^\?q=find-best&product=\d+$/);
      window.history.back();
      await waitFor(() => expect(window.location.pathname).toBe('/planetary-industry/plan'));
      expect(window.location.search).toBe('?q=find-best');
    });

    it('ignores a junk product id beside ?q=, keeping ?q=', async () => {
      window.history.pushState({}, '', '/planetary-industry/map?q=find-best&product=abc');
      render(<App />);
      expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
      await waitFor(() => expect(window.location.search).toBe('?q=find-best'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('drops ?product= when a tab switch leaves the Map', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', `/planetary-industry/map?product=${BIOFUELS}`);
      render(<App />);
      await drawer();
      await user.click(screen.getByRole('tab', { name: 'Colonies' }));
      await waitFor(() => expect(window.location.pathname).toBe('/planetary-industry/colonies'));
      await waitFor(() => expect(window.location.search).not.toContain('product'));
    });
  });

  it('redirects the retired Advisor URL to Colonies, with no Advisor left on the page', async () => {
    window.history.pushState({}, '', '/planetary-industry/advisor');
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(window.location.pathname).toBe('/planetary-industry/colonies');
    expect(screen.queryByRole('heading', { name: 'Advisor' })).toBeNull();
    expect(screen.queryByText('Advisor')).toBeNull();
  });

  it('puts the shared header strip, with the Sell at picker, under the tabs on every tab', async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const strip = screen.getByTestId('pi-header-strip');
    expect(within(strip).getByRole('combobox', { name: 'Where do you sell?' })).toBeInTheDocument();
    expect(within(strip).getByText('Colonies')).toBeInTheDocument();
  });

  it('lets the Sell at picker grow past its minimum, so "My corp buyback" is not cut off', async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const picker = within(screen.getByTestId('pi-header-strip')).getByRole('combobox', {
      name: 'Where do you sell?',
    });
    expect(picker).toHaveClass('min-w-40', 'w-auto');
    expect(picker).not.toHaveClass('w-40');
  });

  it('reads an alt with nothing cached as "not loaded yet", never as having no colonies', async () => {
    await addAlt(92, 'Unread Alt', [PLANETS_SCOPE]);
    await addAlt(93, 'Empty Alt', [PLANETS_SCOPE]);
    await db.esiCache.put({ characterId: 93, key: 'planets', value: [], fetchedAt: Date.now() });

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    const unread = screen.getByText(/^Unread Alt:/);
    const empty = screen.getByText(/Empty Alt/);
    expect(unread).not.toBe(empty);
    expect(unread).toHaveTextContent(/not loaded yet/i);
    expect(empty).toHaveTextContent(/No colonies/i);
  });

  it('switches to an alt straight from the not-loaded list, staying on the page', async () => {
    await addAlt(92, 'Unread Alt', [PLANETS_SCOPE]);
    await addAlt(94, 'Other Unread', [PLANETS_SCOPE]);

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    // One row, and one action, per not-loaded character.
    expect(screen.getByRole('button', { name: 'Switch to Other Unread' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to Unread Alt' }));

    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(92));
    expect(window.location.pathname).toContain('/planetary-industry');
  });

  it('switches to an alt from its colony group header, making its colonies the primary section', async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));
    await user.click(screen.getByRole('button', { name: 'Switch to Alt Two' }));

    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(ALT_ID));
    // The alt is now the active character, so it no longer has a switch action.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Switch to Alt Two' })).not.toBeInTheDocument()
    );
    expect(window.location.pathname).toContain('/planetary-industry');
  });

  it("summarizes an alt colony group's header with its own stopped count and next expiry", async () => {
    const ALT_ID = 92;
    const STOPPED_PLANET_ID = 40000002;
    const ACTIVE_PLANET_ID = 40000003;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [
        { ...planetsPayload[0], planet_id: STOPPED_PLANET_ID, owner_id: ALT_ID },
        { ...planetsPayload[0], planet_id: ACTIVE_PLANET_ID, owner_id: ALT_ID },
      ],
      fetchedAt: Date.now(),
    });
    // Already expired, same fixture the active Character's own colony uses.
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${STOPPED_PLANET_ID}`,
      value: detailPayload,
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ACTIVE_PLANET_ID}`,
      value: {
        links: [],
        routes: [],
        pins: [
          {
            pin_id: 21,
            type_id: 2848,
            latitude: 0,
            longitude: 0,
            expiry_time: new Date(BASE_NOW + 50 * 60_000).toISOString(),
            extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
          },
        ],
      },
      fetchedAt: Date.now(),
    });

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    // One planet already stopped, the other's soonest expiry is what "next"
    // reports — the stopped planet's own (already past) expiry must not leak
    // into it. The minute count itself is deliberately not pinned: it drifts
    // with how long the test took to reach this assertion.
    expect(within(coloniesPanel()).getByText(/^1 stopped · next \d+m$/)).toBeInTheDocument();
  });

  it("badges an alt colony group's header with that alt's own cache age, not the active Character's", async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    const threeDaysAgo = Date.now() - 3 * DAY_MS;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    // The list is the stale read; its detail was fetched recently. The
    // header reports the older of the two.
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: threeDaysAgo,
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: detailPayload,
      fetchedAt: Date.now() - DAY_MS / 24,
    });

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    // The header is the row holding the alt's Switch action.
    const altHeader = screen
      .getByRole('button', { name: 'Switch to Alt Two' })
      .closest('[data-character-group-header]');
    if (!(altHeader instanceof HTMLElement)) throw new Error('no alt group header');
    const badge = altHeader.querySelector('time');
    expect(badge).toHaveAttribute('dateTime', new Date(threeDaysAgo).toISOString());

    // The active Character's own group keeps the page-header badge only.
    const activeHeader = within(coloniesPanel())
      .getByText('Pilot One')
      .closest('[data-character-group-header]');
    if (!(activeHeader instanceof HTMLElement)) throw new Error('no active group header');
    expect(activeHeader.querySelector('time')).toBeNull();
  });

  it("resolves an alt colony's unresolved planet and product names via a public lookup, not raw ids", async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    const ALT_PRODUCT_ID = 77_777;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    server.use(
      http.get(`${ESI}/universe/planets/${ALT_PLANET_ID}`, () =>
        HttpResponse.json({
          planet_id: ALT_PLANET_ID,
          name: 'Amarr III',
          system_id: SYSTEM_ID,
          type_id: 11,
          position: { x: 0, y: 0, z: 0 },
        })
      ),
      http.post(`${ESI}/universe/names`, async ({ request }) => {
        const ids = (await request.json()) as number[];
        const withAltProduct: typeof NAMES = {
          ...NAMES,
          [ALT_PRODUCT_ID]: { name: 'Some Product', category: 'inventory_type' },
        };
        return HttpResponse.json(
          ids.filter((id) => withAltProduct[id]).map((id) => ({ id, ...withAltProduct[id] }))
        );
      })
    );
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: {
        links: [],
        routes: [],
        pins: [
          {
            pin_id: 30,
            type_id: 2848,
            latitude: 0,
            longitude: 0,
            expiry_time: new Date(BASE_NOW + 5 * DAY_MS).toISOString(),
            extractor_details: {
              heads: [{ head_id: 1, latitude: 0, longitude: 0 }],
              product_type_id: ALT_PRODUCT_ID,
            },
          },
        ],
      },
      fetchedAt: Date.now(),
    });

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    const panel = coloniesPanel();
    // The planet name resolves via the public per-planet lookup instead of
    // staying "Planet #id" — the colony data itself is still cache-only
    // (no `/characters/{id}/planets` call for this alt anywhere in this test).
    expect(await within(panel).findByText('Amarr III')).toBeInTheDocument();
    expect(
      within(panel).queryByText(new RegExp(`Planet #${ALT_PLANET_ID}`))
    ).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Show details for Amarr III' }));
    expect((await within(panel).findAllByText('Some Product')).length).toBeGreaterThan(0);
  });
});
