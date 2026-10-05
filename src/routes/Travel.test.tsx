import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import { clearRouteKillCaches } from '@/features/travel/routeKillsData';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { AVOIDED_SYSTEMS_KEY, useAvoidedSystems } from '@/features/route/avoidedSystems';
import {
  AVOIDED_SYSTEMS_ENABLED_KEY,
  clearPodKillsLoad,
  ROUTE_RULE_STORES,
  useAvoidEdencom,
  useAvoidedSystemsEnabled,
  useDefaultRoutePreference,
} from '@/features/route/routeRules';
import { clearEveScoutCache, EVE_SCOUT_SIGNATURES_URL } from '@/lib/eveScout';
import { PHONE_QUERY } from '@/lib/useIsPhone';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  // A smartbomb, for the zKillboard column's tag.
  loadTypes: vi.fn(async () => ({ '3995': { name: 'Large EMP Smartbomb II', groupID: 72 } })),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const loadSolarSystemJumps = vi.fn();
vi.mock('@/sde/loadMarketSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadMarketSde')>()),
  loadSolarSystemJumps: () => loadSolarSystemJumps(),
  loadSolarSystems: async () => SYSTEMS,
  loadMarketRegions: async () => [{ id: 10000002, name: 'The Forge' }],
}));

const CHAR_ID = 91;
const ESI = 'https://esi.evetech.net';

const JITA = 30000142;
const PERIMETER = 30000144;
const UEDAMA = 30002768;
const THERA = 31000005;
// A longer highsec run for the quiet-stretch fold: no ESI or zKillboard kills.
const NIYABAINEN = 30000150;
const MUVOLAILEN = 30000151;
const SOBASEKI = 30000152;

// Its own region, so one rate-limited region leaves the others filling in.
const PERIMETER_REGION = 10000043;
const UEDAMA_REGION = 10000033;

const SYSTEMS = [
  { id: JITA, name: 'Jita', security: 0.9459, regionId: 10000002 },
  { id: PERIMETER, name: 'Perimeter', security: 0.95, regionId: PERIMETER_REGION },
  { id: UEDAMA, name: 'Uedama', security: 0.505, regionId: UEDAMA_REGION },
  { id: THERA, name: 'Thera', security: -0.99, regionId: 11000031 },
  { id: NIYABAINEN, name: 'Niyabainen', security: 0.71, regionId: 10000002 },
  { id: MUVOLAILEN, name: 'Muvolailen', security: 0.62, regionId: 10000002 },
  { id: SOBASEKI, name: 'Sobaseki', security: 0.84, regionId: 10000002 },
];

const JUMPS = {
  [JITA]: [PERIMETER],
  [PERIMETER]: [JITA, UEDAMA],
  [UEDAMA]: [PERIMETER],
  [THERA]: [],
};

const HOUR = 3_600_000;
const TURNUR = 30002086;

function signature(overrides: Record<string, unknown>) {
  return {
    id: '1',
    signature_type: 'wormhole',
    out_system_id: THERA,
    out_system_name: 'Thera',
    out_signature: 'AAA-111',
    in_signature: 'BBB-222',
    in_system_class: 'hs',
    in_region_name: 'The Forge',
    wh_type: 'Q063',
    max_ship_size: 'medium',
    expires_at: new Date(Date.now() + 10 * HOUR).toISOString(),
    ...overrides,
  };
}

const SIGNATURES = [
  signature({
    id: 'uedama',
    in_system_id: UEDAMA,
    in_system_name: 'Uedama',
    in_signature: 'UED-001',
  }),
  signature({
    id: 'perimeter',
    out_system_id: TURNUR,
    out_system_name: 'Turnur',
    in_system_id: PERIMETER,
    in_system_name: 'Perimeter',
    in_signature: 'PER-002',
    max_ship_size: 'capital',
    expires_at: new Date(Date.now() + HOUR).toISOString(),
  }),
  signature({
    id: 'jspace',
    in_system_id: 31000629,
    in_system_name: 'J120704',
    in_system_class: 'c2',
    in_region_name: 'C-R00010',
  }),
  signature({
    id: 'expired',
    in_system_id: JITA,
    in_system_name: 'Jita',
    expires_at: new Date(Date.now() - HOUR).toISOString(),
  }),
];

const UEDAMA_GATE_TO_PERIMETER = 50001001;
const KILL_TIME = new Date(Date.now() - 12 * 60_000).toISOString();

const server = setupServer(
  http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(SIGNATURES)),
  http.get('https://zkillboard.com/api/kills/regionID/:id/pastSeconds/3600/', ({ params }) => {
    if (Number(params.id) === PERIMETER_REGION) return new HttpResponse(null, { status: 429 });
    if (Number(params.id) !== UEDAMA_REGION) return HttpResponse.json([]);
    const kill = (id: number, npc: boolean) => ({
      killmail_id: id,
      killmail_time: KILL_TIME,
      solar_system_id: UEDAMA,
      attackers: [{ ship_type_id: 4310, weapon_type_id: 3995 }],
      victim: { ship_type_id: 670 },
      zkb: { locationID: UEDAMA_GATE_TO_PERIMETER, npc },
    });
    return HttpResponse.json([kill(1, false), kill(2, false), kill(3, true)]);
  }),
  http.get(`${ESI}/universe/stargates/${UEDAMA_GATE_TO_PERIMETER}`, () =>
    HttpResponse.json({
      stargate_id: UEDAMA_GATE_TO_PERIMETER,
      name: 'Stargate (Perimeter)',
      system_id: UEDAMA,
      destination: { stargate_id: 50001000, system_id: PERIMETER },
    })
  ),
  http.get(`${ESI}/universe/system_kills`, () =>
    HttpResponse.json([{ system_id: UEDAMA, ship_kills: 12, pod_kills: 4, npc_kills: 2 }])
  ),
  http.get(`${ESI}/universe/system_jumps`, () =>
    HttpResponse.json([
      { system_id: JITA, ship_jumps: 4200 },
      { system_id: UEDAMA, ship_jumps: 900 },
    ])
  ),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([{ id: 10000033, name: 'The Citadel', category: 'region' }])
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/location`, () =>
    HttpResponse.json({ solar_system_id: JITA })
  )
);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // One throwaway render of a Route Safety route, so no test pays for the
  // first one. A worker's first `App` render — compiling the lazy route
  // chunks, warming jsdom and React — cost 4-6s on top of a warm render, and
  // it landed on whichever test ran first. Done here under the hook's own
  // budget; `beforeEach` clears every cache it filled.
  await routeChunks.loadTravel();
  await resetState();
  window.history.pushState({}, '', `/travel/route?from=${JITA}&to=${UEDAMA}`);
  const { unmount } = render(<App />);
  await screen.findByRole('table', { name: 'Systems on the route' }, { timeout: 25_000 });
  unmount();
}, 30_000);
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => resetState());

async function resetState() {
  clearJumpGraphIndex();
  clearSolarSystemIndex();
  clearEveScoutCache();
  clearRouteKillCaches();
  loadSolarSystemJumps.mockReset();
  loadSolarSystemJumps.mockResolvedValue(JUMPS);
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-location.read_location.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
}

/** One labelled figure from the route summary strip, e.g. `routeFact('Jumps')` → "4". */
function routeFact(label: string) {
  const summary = within(screen.getByRole('group', { name: 'Route summary' }));
  return summary.getByText(label, { selector: 'span' }).parentElement?.lastElementChild
    ?.textContent;
}

function visit(search: string) {
  window.history.pushState({}, '', `/travel/route${search}`);
  render(<App />);
}

describe('Travel › Route Safety', () => {
  it('lists every system on the route in order with its last hour of activity', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const rows = await within(table).findAllByRole('row');
    const body = rows.slice(1);
    expect(body.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Jita',
      'Perimeter',
      expect.stringContaining('Uedama'),
    ]);

    const uedama = within(body[2]);
    expect(await uedama.findByText('12')).toBeInTheDocument();
    expect(uedama.getByText('900')).toBeInTheDocument();
    expect(uedama.getByText('Gank Chokepoint')).toBeInTheDocument();
    expect(await uedama.findByText('The Citadel')).toBeInTheDocument();
    expect(within(body[0]).getByText('The Forge')).toBeInTheDocument();

    expect(routeFact('Chokepoints')).toBe('Uedama');
    expect(routeFact('Jumps')).toBe('2');
    expect(routeFact('High')).toBe('3');
    expect(routeFact('Low')).toBe('0');
    expect(routeFact('Null')).toBe('0');
    expect(routeFact('Lowest')).toBe('0.5');
    expect(routeFact('Kills 1h')).toBe('12 ship · 4 pod');
  });

  it('draws the route strip with a spoken description and its key systems', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    expect(
      await screen.findByRole('img', {
        name: 'Route strip, 3 systems from Jita to Uedama. Key systems: Jita 0.9, Uedama 0.5, Gank Chokepoint. Kills in the last hour in: Uedama.',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(3);
  });

  it('opens NPC kills and kills off the route in the row detail', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);
    await within(body[2]).findByRole('link', { name: /^2 player kills\s*\(opens/ });
    await user.click(within(body[2]).getByText('Uedama'));
    expect(await within(table).findByText('NPC kills in the last hour: 2')).toBeInTheDocument();
    expect(
      within(table).getByText('No zKillboard kills elsewhere in the system in the last hour.')
    ).toBeInTheDocument();
  });

  it('folds a quiet stretch into one row that opens in place', async () => {
    const user = userEvent.setup();
    loadSolarSystemJumps.mockResolvedValue({
      [JITA]: [NIYABAINEN],
      [NIYABAINEN]: [JITA, MUVOLAILEN],
      [MUVOLAILEN]: [NIYABAINEN, SOBASEKI],
      [SOBASEKI]: [MUVOLAILEN],
    });
    visit(`?from=${JITA}&to=${SOBASEKI}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const fold = await within(table).findByRole('button', {
      name: '2 systems · Niyabainen → Muvolailen · lowest 0.6 · no kills reported in the last hour',
    });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(within(table).queryByText('Niyabainen')).not.toBeInTheDocument();
    // The ends never fold.
    expect(within(table).getByText('Jita')).toBeInTheDocument();
    expect(within(table).getByText('Sobaseki')).toBeInTheDocument();

    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(within(table).getByText('Niyabainen')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Avoid Muvolailen' })).toBeInTheDocument();
  });

  it("fills in each system's zKillboard kills by location, one row at a time", async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);

    const uedama = within(body[2]);
    const count = await uedama.findByRole('link', { name: /^2 player kills\s*\(opens/ });
    expect(count).toHaveAttribute('href', `https://zkillboard.com/system/${UEDAMA}/`);
    expect(
      await uedama.findByText('2 kills at Stargate (Perimeter), last one 12 min ago')
    ).toBeInTheDocument();
    expect(uedama.getByText('On your route')).toBeInTheDocument();
    expect(uedama.getByText('Smartbombs involved')).toBeInTheDocument();

    // A rate-limited system says so on its own row; the rest still fill in.
    expect(await within(body[1]).findByText('zKillboard unavailable')).toBeInTheDocument();
    expect(
      await within(body[0]).findByRole('link', { name: /^0 player kills\s*\(opens/ })
    ).toBeInTheDocument();
  });

  it('starts from the Current System when the link names no start', async () => {
    visit(`?to=${UEDAMA}`);

    expect(await screen.findByRole('table', { name: 'Systems on the route' })).toBeInTheDocument();
    expect(await screen.findByText('Jita (current system)')).toBeInTheDocument();
  });

  it('says so when start and destination are the same system', async () => {
    visit(`?from=${JITA}&to=${JITA}`);

    expect(
      await screen.findByText('Start and destination are the same system')
    ).toBeInTheDocument();
  });

  it('says no stargate route exists, distinct from not knowing', async () => {
    visit(`?from=${JITA}&to=${THERA}`);

    expect(await screen.findByText('No stargate route connects these systems')).toBeInTheDocument();
  });

  it('says the route cannot be worked out when the stargate map is unreadable', async () => {
    loadSolarSystemJumps.mockRejectedValue(new Error('offline'));
    visit(`?from=${JITA}&to=${UEDAMA}`);

    expect(await screen.findByText("This route can't be worked out right now")).toBeInTheDocument();
  });

  it('opens Route Safety from the bare /travel path', async () => {
    window.history.pushState({}, '', '/travel');
    render(<App />);

    expect(await screen.findByText('Pick where the route starts and ends')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/travel/route');
  });

  it('opens Pilot Lookup from a bare /travel?pilot= link', async () => {
    server.use(
      http.get(`${ESI}/characters/42`, () =>
        HttpResponse.json({
          name: 'Some Pilot',
          birthday: '2010-01-01T00:00:00Z',
          corporation_id: 200,
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
        })
      ),
      http.post(`${ESI}/characters/affiliation`, () =>
        HttpResponse.json([{ character_id: 42, corporation_id: 200 }])
      ),
      http.post(`${ESI}/universe/names`, () =>
        HttpResponse.json([{ id: 200, name: 'Some Corp', category: 'corporation' }])
      ),
      http.get('https://zkillboard.com/api/stats/characterID/42/', () =>
        HttpResponse.json({ error: 'Invalid type or id' })
      )
    );
    window.history.pushState({}, '', '/travel?pilot=42');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pilot-lookup');
    expect(window.location.search).toBe('?pilot=42');
    expect(await screen.findByText('No kills or losses on zKillboard')).toBeInTheDocument();
  });
});

describe('Travel › Route Safety › Stops', () => {
  /** Uedama ─ Perimeter ─ Jita ─ Niyabainen ─ Muvolailen ─ Sobaseki, and Thera with no gates. */
  const LINE = {
    [UEDAMA]: [PERIMETER],
    [PERIMETER]: [UEDAMA, JITA],
    [JITA]: [PERIMETER, NIYABAINEN],
    [NIYABAINEN]: [JITA, MUVOLAILEN],
    [MUVOLAILEN]: [NIYABAINEN, SOBASEKI],
    [SOBASEKI]: [MUVOLAILEN],
    [THERA]: [],
  };

  beforeEach(() => {
    loadSolarSystemJumps.mockResolvedValue(LINE);
  });

  const stopsInLink = () => new URLSearchParams(window.location.search).get('stops');

  function legHeader(name: RegExp) {
    return within(screen.getByRole('list', { name: 'Itinerary by leg' })).getByRole('button', {
      name,
    });
  }

  it('lists the trip by leg, the first open, under facts covering the whole trip', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA}`);

    expect(await screen.findByRole('table', { name: 'Systems on leg 1' })).toBeInTheDocument();
    expect(legHeader(/^Leg 1 · Jita → Sobaseki · 3 j/)).toHaveAttribute('aria-expanded', 'true');
    const second = legHeader(
      /^Leg 2 · Sobaseki → Uedama · 5 j · lowest 0\.5 · Gank Chokepoints: Uedama/
    );
    expect(second).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table', { name: 'Systems on leg 2' })).not.toBeInTheDocument();

    expect(routeFact('Jumps')).toBe('8');
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(9);

    await user.click(second);
    expect(screen.getByRole('table', { name: 'Systems on leg 2' })).toBeInTheDocument();
  });

  it('previews an Avoid as the whole trip, not the leg it was asked from', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on leg 1' });
    await user.click(await within(table).findByRole('button', { name: /^2 systems/ }));
    await user.click(within(table).getByRole('button', { name: 'Avoid Niyabainen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Avoid Niyabainen?' });

    expect(
      await within(dialog).findByText(/^The route becomes 8 jumps \(\+0\)/)
    ).toBeInTheDocument();
  });

  it('adds a stop from the picker, writing the stops into the link', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    await user.click(screen.getByRole('button', { name: 'Add a stop' }));
    await user.type(await screen.findByRole('combobox'), 'Sobas');
    await user.click(await screen.findByRole('option', { name: /Sobaseki/ }));

    expect(stopsInLink()).toBe(`${UEDAMA},${SOBASEKI}`);
    expect(new URLSearchParams(window.location.search).get('to')).toBeNull();
    expect(await screen.findByRole('list', { name: 'Itinerary by leg' })).toBeInTheDocument();
  });

  it('reorders and removes stops with each row’s buttons', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&stops=${UEDAMA},${SOBASEKI}`);

    await user.click(await screen.findByRole('button', { name: 'Move Sobaseki up' }));
    expect(stopsInLink()).toBe(`${SOBASEKI},${UEDAMA}`);
    expect(screen.getByRole('button', { name: 'Move Sobaseki up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Remove Uedama' }));
    expect(stopsInLink()).toBe(String(SOBASEKI));
    // One stop is the page as it always was.
    expect(await screen.findByRole('table', { name: 'Systems on the route' })).toBeInTheDocument();
  });

  it('optimizes the stop order and says what changed', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA},${NIYABAINEN}&pref=shortest`);

    await screen.findByRole('list', { name: 'Itinerary by leg' });
    await user.click(screen.getByRole('switch', { name: 'Optimize stop order' }));

    expect(new URLSearchParams(window.location.search).get('opt')).toBe('1');
    expect(
      await screen.findByText(
        'Order changed: Uedama → Niyabainen → Sobaseki · 11 jumps in typed order → 7 jumps'
      )
    ).toBeInTheDocument();
    expect(legHeader(/^Leg 1 · Jita → Uedama/)).toBeInTheDocument();
    // The typed order stays in the link and the list.
    expect(stopsInLink()).toBe(`${SOBASEKI},${UEDAMA},${NIYABAINEN}`);
  });

  it('keeps the last stop last when asked', async () => {
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA},${NIYABAINEN}&pref=shortest&opt=1&keep=1`);

    expect(
      await screen.findByText(
        'Order changed: Uedama → Sobaseki → Niyabainen · 11 jumps in typed order → 9 jumps'
      )
    ).toBeInTheDocument();
  });

  it('leaves zero kill counts off a phone row, keeping its jumps', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (media: string) =>
        ({
          media,
          matches: media === PHONE_QUERY,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    try {
      visit(`?from=${JITA}&to=${UEDAMA}`);

      const table = await screen.findByRole('table', { name: 'Systems on the route' });
      const body = (await within(table).findAllByRole('row')).slice(1);
      const lastHour = (row: HTMLElement) => within(row).getAllByRole('cell')[3];
      await waitFor(() => expect(lastHour(body[2])).toHaveTextContent('12ship kills'));
      expect(lastHour(body[2])).toHaveTextContent('4pod kills');
      expect(lastHour(body[0])).toHaveTextContent('4,200jumps');
      expect(lastHour(body[0])).not.toHaveTextContent('ship kills');
      expect(lastHour(body[0])).not.toHaveTextContent('pod kills');
    } finally {
      matchMedia.mockRestore();
    }
  });

  it('folds the stops to one line on a phone, with Edit to open them', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (media: string) =>
        ({
          media,
          matches: media === PHONE_QUERY,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    try {
      const user = userEvent.setup();
      visit(`?stops=${SOBASEKI},${UEDAMA}`);

      expect(await screen.findByText('Jita → 2 stops')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add a stop' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Edit stops' }));
      expect(screen.getByRole('button', { name: 'Add a stop' })).toBeInTheDocument();
    } finally {
      matchMedia.mockRestore();
    }
  });

  it('gives an unreachable stop its leg’s no-route message and turns optimizing off', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&stops=${UEDAMA},${THERA}&opt=1`);

    const leg = await screen.findByRole('button', {
      name: /^Leg 2 · Uedama → Thera · no stargate route/,
    });
    expect(screen.getByRole('switch', { name: 'Optimize stop order' })).toBeDisabled();
    expect(
      screen.getByText(/A stop no stargate route reaches can't be put in order/)
    ).toBeInTheDocument();
    // The reachable leg still draws.
    expect(screen.getByRole('table', { name: 'Systems on leg 1' })).toBeInTheDocument();

    await user.click(leg);
    expect(screen.getByText(/No stargate route connects Uedama and Thera/)).toBeInTheDocument();
  });
});

describe('Travel › Route Safety › Route rules', () => {
  beforeEach(() => {
    // The Travel Settings stores outlive a test; make each one read its seeded rows afresh.
    for (const store of ROUTE_RULE_STORES) {
      (store.setState as (partial: { hydrated: boolean }) => void)({ hydrated: false });
    }
    useDefaultRoutePreference.setState({ value: 'prefer-highsec' });
    useAvoidEdencom.setState({ value: false });
    useAvoidedSystems.setState({ value: [] });
    useAvoidedSystemsEnabled.setState({ value: true });
    clearPodKillsLoad();
  });

  async function avoidButton(name: string) {
    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    return within(table).findByRole('button', { name: `Avoid ${name}` });
  }

  it('changes the Route Preference in the link only, never the saved default', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const group = await screen.findByRole('group', { name: 'Route preference' });
    expect(within(group).getByRole('button', { name: 'Safer' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(within(group).getByRole('button', { name: 'Shorter' }));

    expect(new URLSearchParams(window.location.search).get('pref')).toBe('shortest');
    expect(useDefaultRoutePreference.getState().value).toBe('prefer-highsec');
    // Prefer shorter counts jumps only, so the penalty is off — as in Settings.
    expect(screen.getByRole('spinbutton', { name: 'Security penalty' })).toBeDisabled();
  });

  it('edits the same Travel Settings Settings → Travel does', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await user.click(
      await screen.findByRole('checkbox', { name: /EDENCOM systems \(137 systems\)/ })
    );

    expect(useAvoidEdencom.getState().value).toBe(true);
  });

  it('offers Avoid on every row but the two ends', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await avoidButton('Perimeter');
    const table = screen.getByRole('table', { name: 'Systems on the route' });
    expect(within(table).queryByRole('button', { name: 'Avoid Jita' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Avoid Uedama' })).not.toBeInTheDocument();
  });

  it('offers no Avoid for a system already on the Avoided Systems', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [PERIMETER] });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    await within(table).findByText('Perimeter');
    expect(
      within(table).queryByRole('button', { name: 'Avoid Perimeter' })
    ).not.toBeInTheDocument();
  });

  it('previews the route before saving, and says plainly when there is no way around', async () => {
    const user = userEvent.setup();
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await user.click(await avoidButton('Perimeter'));
    const dialog = await screen.findByRole('dialog', { name: 'Avoid Perimeter?' });
    expect(
      await within(dialog).findByText('The route becomes 2 jumps (+0), lowest 0.5')
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/no way around Perimeter/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/the list is still off/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/jump counts change everywhere in the app/)
    ).toBeInTheDocument();
    // Previewing saved nothing.
    expect(useAvoidedSystems.getState().value).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Avoid Perimeter' }));

    expect(useAvoidedSystems.getState().value).toEqual([PERIMETER]);
    expect(await db.settings.get(AVOIDED_SYSTEMS_KEY)).toMatchObject({ value: [PERIMETER] });
  });

  it('says the Avoided Systems switch is off, and switches it on along with the add', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_ENABLED_KEY, value: false });
    const user = userEvent.setup();
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await user.click(await avoidButton('Perimeter'));
    const dialog = await screen.findByRole('dialog', { name: 'Avoid Perimeter?' });
    expect(within(dialog).getByText(/Avoided Systems is switched off/)).toBeInTheDocument();
    await within(dialog).findByText(/The route becomes 2 jumps/);
    // Each button carries its own outcome.
    const switchOn = within(dialog).getByRole('group', { name: 'Switch on and avoid' });
    expect(within(switchOn).getByText(/The route becomes 2 jumps/)).toBeInTheDocument();
    const listOnly = within(dialog).getByRole('group', { name: 'Add to the list only' });
    expect(
      within(listOnly).getByText(/The route stays at 2 jumps \(\+0\): the list is still off/)
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Switch on and avoid' }));

    expect(useAvoidedSystems.getState().value).toEqual([PERIMETER]);
    await waitFor(() => expect(useAvoidedSystemsEnabled.getState().value).toBe(true));
  });
});

describe('Travel › Route Safety › Thera / Turnur holes', () => {
  /** Jita ─ Niyabainen ─ Muvolailen ─ Sobaseki ─ Uedama by gate; Thera has none. */
  const LONG_WAY = {
    [JITA]: [NIYABAINEN],
    [NIYABAINEN]: [JITA, MUVOLAILEN],
    [MUVOLAILEN]: [NIYABAINEN, SOBASEKI],
    [SOBASEKI]: [MUVOLAILEN, UEDAMA],
    [UEDAMA]: [SOBASEKI],
    [THERA]: [],
  };
  const HOLES = [
    signature({
      id: 'jita',
      in_system_id: JITA,
      in_system_name: 'Jita',
      in_signature: 'JIT-001',
      out_signature: 'THR-001',
    }),
    signature({
      id: 'uedama',
      in_system_id: UEDAMA,
      in_system_name: 'Uedama',
      in_signature: 'UED-002',
      out_signature: 'THR-002',
    }),
  ];

  beforeEach(() => {
    loadSolarSystemJumps.mockResolvedValue(LONG_WAY);
  });

  it('routes through the holes when that costs less, each a row of its own', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

    expect(await screen.findAllByTestId('route-strip-hole')).toHaveLength(2);
    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);
    const firstCells = body.map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
    expect(firstCells).toHaveLength(5);
    expect(firstCells[0]).toBe('Jita');
    expect(firstCells[1]).toContain('Warp to JIT-001 in Jita');
    expect(firstCells[1]).toContain('Q063');
    expect(firstCells[2]).toBe('Thera');
    expect(firstCells[3]).toContain('Warp to THR-002 in Thera');
    expect(firstCells[4]).toContain('Uedama');
    expect(within(body[2]).getByText('N/A')).toBeInTheDocument();
    expect(
      within(body[2]).getByRole('button', { name: "ESI doesn't report wormhole space" })
    ).toBeInTheDocument();
    expect(
      within(body[1]).getByRole('button', { name: 'Copy signature JIT-001 in Jita' })
    ).toBeInTheDocument();

    expect(routeFact('Jumps')).toBe('2');
    expect(routeFact('By gate')).toBe('0');
    expect(routeFact('Wormhole')).toBe('2');
    // Thera is counted as wormhole jumps, never as a nullsec system or the lowest security.
    expect(routeFact('High')).toBe('2');
    expect(routeFact('Null')).toBe('0');
    expect(routeFact('Lowest')).toBe('0.5');
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(3);
  });

  it('sets in-game waypoints only up to the hole entrance', async () => {
    const user = userEvent.setup();
    loadSolarSystemJumps.mockResolvedValue({
      ...LONG_WAY,
      [PERIMETER]: [JITA],
      [JITA]: [PERIMETER, NIYABAINEN],
    });
    await db.tokens.update(CHAR_ID, {
      scopes: ['esi-location.read_location.v1', 'esi-ui.write_waypoint.v1'],
    });
    const sent: string[] = [];
    server.use(
      http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)),
      http.post(`${ESI}/ui/autopilot/waypoint`, ({ request }) => {
        sent.push(new URL(request.url).searchParams.get('destination_id') ?? '');
        return new HttpResponse(null, { status: 204 });
      })
    );
    visit(`?from=${PERIMETER}&to=${UEDAMA}&wh=1`);

    expect(await screen.findAllByTestId('route-strip-hole')).toHaveLength(2);
    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(
      await screen.findByText(
        /Waypoints set to Jita\. Take the wormhole there, then set the rest from Thera\./
      )
    ).toBeInTheDocument();
    expect(sent).toEqual([String(JITA)]);
  });

  it('skips holes the ship does not fit, and flies the gates', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1&whsize=large`);
    await waitFor(() =>
      expect(screen.queryByText('Checking Thera / Turnur connections…')).toBeNull()
    );

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    await waitFor(() =>
      expect(within(table).getAllByRole('row').slice(1)[0]).toHaveTextContent('Jita')
    );
    expect(screen.queryByTestId('route-strip-hole')).toBeNull();
    expect(routeFact('Jumps')).toBe('4');
  });

  it('never asks EVE-Scout with the switch off', async () => {
    const asked = vi.fn(() => HttpResponse.json(HOLES));
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, asked));
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    expect(routeFact('Jumps')).toBe('4');
    expect(asked).not.toHaveBeenCalled();
  });

  it('shows the gate route while the hole list loads, and says so', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new Promise<never>(() => {})));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

    expect(await screen.findByText('Checking Thera / Turnur connections…')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Systems on the route' })).toBeInTheDocument();
  });

  it('falls back to gates when EVE-Scout cannot be reached, and says so', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new HttpResponse(null, { status: 503 })));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

    expect(
      await screen.findByText("EVE-Scout couldn't be reached, so this route uses gates only.")
    ).toBeInTheDocument();
    expect(routeFact('Jumps')).toBe('4');
  });

  describe('ways to fly a leg', () => {
    const pinInLink = () => new URLSearchParams(window.location.search).get('pin');
    const waysPanel = () => screen.findByRole('region', { name: 'Ways to fly leg 1' });

    beforeEach(() => {
      server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)));
    });

    it('lists each way with its facts, the one in use first', async () => {
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

      const panel = await waysPanel();
      await within(panel).findByText('Via Thera');
      const [inUse, gates] = within(panel).getAllByRole('listitem');
      expect(inUse).toHaveTextContent(/^Via TheraIn use2 j/);
      expect(inUse).toHaveTextContent('Jita → Thera');
      expect(inUse).toHaveTextContent('Thera → Uedama');
      expect(inUse).toHaveTextContent('fits Medium');
      expect(gates).toHaveTextContent(/^Gates only4 j/);
      expect(gates).toHaveTextContent('lowest 0.5·0 lowsec·0 nullsec');
      expect(gates).toHaveTextContent('passes Uedama');
      expect(
        within(inUse).queryByRole('button', { name: /^Use .* for leg 1$/ })
      ).not.toBeInTheDocument();
    });

    it('pins a way into the link, and the leg flies it', async () => {
      const user = userEvent.setup();
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

      const panel = await waysPanel();
      await user.click(
        await within(panel).findByRole('button', { name: 'Use Gates only for leg 1' })
      );
      expect(pinInLink()).toBe('gates');
      await waitFor(() => expect(routeFact('Jumps')).toBe('4'));
      // The leg re-plans, so the panel is drawn afresh.
      await waitFor(async () =>
        expect(within(await waysPanel()).getAllByRole('listitem')[0]).toHaveTextContent(
          /^Gates onlyIn use/
        )
      );

      await user.click(
        within(await waysPanel()).getByRole('button', { name: 'Use Via Thera for leg 1' })
      );
      expect(pinInLink()).toBe('thera');
      await waitFor(() => expect(routeFact('Jumps')).toBe('2'));
    });

    it('previews an Avoid on a pinned leg as the leg is flown, pin and all', async () => {
      const user = userEvent.setup();
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&pin=gates`);

      await waitFor(() => expect(routeFact('Jumps')).toBe('4'));
      const table = await screen.findByRole('table', { name: 'Systems on the route' });
      await user.click(await within(table).findByRole('button', { name: /^3 systems/ }));
      await user.click(within(table).getByRole('button', { name: 'Avoid Muvolailen' }));
      const dialog = await screen.findByRole('dialog', { name: 'Avoid Muvolailen?' });

      // Gates only is pinned, and gates only has no way around Muvolailen: the
      // trip stays 4 jumps, never the unpinned hole route's 2.
      expect(
        await within(dialog).findByText(/^The route becomes 4 jumps \(\+0\)/)
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/no way around Muvolailen/)).toBeInTheDocument();
    });

    it('says when a pinned hole has closed, and flies the planner’s pick', async () => {
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&pin=gone`);

      expect(
        await screen.findByText(
          "The pinned wormhole has closed or is no longer on EVE-Scout's list, so this leg flies the planner's pick."
        )
      ).toBeInTheDocument();
      expect(routeFact('Jumps')).toBe('2');
    });

    it('says when a pinned hub has no qualifying hole', async () => {
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&whhub=turnur&pin=thera`);

      expect(
        await screen.findByText(
          "No open Thera hole fits the hole settings, so this leg flies the planner's pick."
        )
      ).toBeInTheDocument();
      expect(routeFact('Jumps')).toBe('4');
    });

    it('says EVE-Scout could not be reached for a pinned hole, never that the switch is off', async () => {
      server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new HttpResponse(null, { status: 503 })));
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&pin=uedama`);

      expect(
        await screen.findByText(
          "EVE-Scout couldn't be reached, so the pinned way can't be checked. This leg flies the planner's pick."
        )
      ).toBeInTheDocument();
      expect(screen.queryByText(/Route through Thera \/ Turnur is off/)).toBeNull();
    });

    it('opens a Route via link asking for a stop, then flies the pinned hole', async () => {
      const user = userEvent.setup();
      visit(`?from=${JITA}&wh=1&pin=uedama`);

      expect(
        await screen.findByText('Add a stop to fly there through the pinned wormhole.')
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Add a stop' }));
      await user.type(await screen.findByRole('combobox'), 'Ueda');
      await user.click(await screen.findByRole('option', { name: /Uedama/ }));

      expect(pinInLink()).toBe('uedama');
      await waitFor(async () =>
        expect(within(await waysPanel()).getAllByRole('listitem')[0]).toHaveTextContent(
          /^Pinned hole via TheraIn use2 j/
        )
      );
    });

    it('folds the ways under the leg on a phone', async () => {
      const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
        (media: string) =>
          ({
            media,
            matches: media === PHONE_QUERY,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList
      );
      try {
        const user = userEvent.setup();
        visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

        const toggle = await screen.findByRole('button', { name: 'Compare ways to fly leg 1' });
        await waitFor(() => expect(toggle).toHaveTextContent('Gates only·4 jumpsCompare'));
        expect(screen.queryByRole('region', { name: 'Ways to fly leg 1' })).toBeNull();
        await user.click(toggle);
        expect(await waysPanel()).toBeInTheDocument();
      } finally {
        matchMedia.mockRestore();
      }
    });
  });
});

describe('Travel › Thera / Turnur', () => {
  const MAIN_TABLE = 'Open holes out of Thera and Turnur';
  const JSPACE_TABLE = 'Open holes into J-space';
  const JSPACE_GROUP = /exits? into J-space · no gate route from you/;

  function visitThera(search: string) {
    window.history.pushState({}, '', '/travel/thera' + search);
    render(<App />);
  }

  /** The connection ids a table lists, top to bottom. */
  function holesIn(table: HTMLElement) {
    return within(table)
      .getAllByRole('row')
      .map((row) => row.getAttribute('data-row-key'))
      .filter((key) => key !== null);
  }

  function holeRow(id: string) {
    return document.querySelector<HTMLElement>(`tr[data-row-key="${id}"]`)!;
  }

  it('links each K-space row a gate route reaches to Route Safety through its hole', async () => {
    visitThera('');

    const links = await screen.findAllByRole('link', {
      name: 'Plan a route through the Thera hole at Uedama',
    });
    expect(links[0]).toHaveAttribute('href', `/travel/route?from=${JITA}&wh=1&pin=uedama`);
    expect(
      screen.queryByRole('link', { name: /Plan a route through the Thera hole at J120704/ })
    ).not.toBeInTheDocument();
  });

  function stubPhone() {
    return vi.spyOn(window, 'matchMedia').mockImplementation(
      (media: string) =>
        ({
          media,
          matches: media === PHONE_QUERY,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
  }

  it('lists live K-space holes nearest first, folding J-space exits into a group under them', async () => {
    visitThera('');

    expect(await screen.findByText('Jita (current system)')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: MAIN_TABLE });
    // Perimeter is one jump from Jita, Uedama two; the expired Jita hole is gone.
    await waitFor(() => expect(holesIn(table)).toEqual(['perimeter', 'uedama']));
    const perimeter = within(holeRow('perimeter'));
    expect(perimeter.getByText('Perimeter')).toHaveClass('font-semibold');
    expect(perimeter.getByText('Turnur')).toBeInTheDocument();
    expect(perimeter.getByText('Capital')).toBeInTheDocument();
    expect(perimeter.getByText('AAA-111')).toBeInTheDocument();
    // The type code waits for the expanded row.
    expect(perimeter.queryByText(/Q063/)).not.toBeInTheDocument();

    const group = screen.getByRole('button', {
      name: '1 exit into J-space · no gate route from you',
    });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table', { name: JSPACE_TABLE })).not.toBeInTheDocument();
    fireEvent.click(group);
    const jspace = await screen.findByRole('table', { name: JSPACE_TABLE });
    expect(holesIn(jspace)).toEqual(['jspace']);
    expect(within(holeRow('jspace')).getByText('No gate route')).toBeInTheDocument();
    expect(within(holeRow('jspace')).getByText('C2')).toBeInTheDocument();
  });

  it('shows a connection with two hours or less left in the warning color', async () => {
    visitThera('');

    await screen.findByRole('table', { name: MAIN_TABLE });
    const life = (id: string) => within(holeRow(id)).getAllByRole('cell')[4]!.firstElementChild;
    expect(life('perimeter')).toHaveClass('text-warning');
    expect(life('uedama')).not.toHaveClass('text-warning');
  });

  it('opens a row onto its type, both signatures and the exit on zKillboard', async () => {
    visitThera('');

    await screen.findByRole('table', { name: MAIN_TABLE });
    fireEvent.click(holeRow('uedama'));
    expect(await screen.findByText('Type Q063')).toBeInTheDocument();
    expect(screen.getByText('enter at AAA-111 in Thera, leave at UED-001')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Uedama on zKillboard (opens in a new tab)' })
    ).toHaveAttribute('href', `https://zkillboard.com/system/${UEDAMA}/`);
  });

  it('filters by hub from the URL, counting each hub under the other filters', async () => {
    visitThera('?hub=thera');

    const table = await screen.findByRole('table', { name: MAIN_TABLE });
    expect(holesIn(table)).toEqual(['uedama']);
    const user = userEvent.setup();
    const hub = screen.getByRole('combobox', { name: 'Hub' });
    expect(hub).toHaveTextContent('Thera 1');
    await user.click(hub);
    expect(await screen.findByRole('option', { name: 'Both 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Turnur 1' })).toBeInTheDocument();
  });

  it.each(['all', 'bogus'])('reads an unknown exit param (space=%s) as K-space', async (space) => {
    visitThera(`?space=${space}`);

    const table = await screen.findByRole('table', { name: MAIN_TABLE });
    await waitFor(() => expect(holesIn(table)).toEqual(['perimeter', 'uedama']));
    expect(screen.getByRole('combobox', { name: 'Exit' })).toHaveTextContent('K-space');
    expect(screen.getByRole('button', { name: JSPACE_GROUP })).toBeInTheDocument();
  });

  it('shows only the J-space exits under the J-space filter, with no group', async () => {
    visitThera('?space=wormhole');

    const table = await screen.findByRole('table', { name: JSPACE_TABLE });
    expect(holesIn(table)).toEqual(['jspace']);
    expect(screen.queryByRole('table', { name: MAIN_TABLE })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: JSPACE_GROUP })).not.toBeInTheDocument();
  });

  it('narrows to one band from the URL', async () => {
    visitThera('?space=lowsec');
    expect(await screen.findByText('No connections match these filters')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: JSPACE_GROUP })).not.toBeInTheDocument();
  });

  it('says an origin with no stargates reaches no exit by gate', async () => {
    visitThera(`?origin=${THERA}`);
    expect(
      await screen.findByText('Thera has no stargates, so no exit can be reached by gate from it.')
    ).toBeInTheDocument();
  });

  it('keeps only connections that pass at least the chosen ship size', async () => {
    visitThera('?size=capital');
    const table = await screen.findByRole('table', { name: MAIN_TABLE });
    expect(holesIn(table)).toEqual(['perimeter']);
    // The J-space hole stops at medium hulls.
    expect(screen.queryByRole('button', { name: JSPACE_GROUP })).not.toBeInTheDocument();
  });

  it('says so when the filters leave no hole', async () => {
    // Thera's two holes both stop at medium hulls.
    visitThera('?hub=thera&size=capital');
    expect(await screen.findByText('No connections match these filters')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: MAIN_TABLE })).not.toBeInTheDocument();
  });

  it('says no K-space hole matches when only J-space exits are open', async () => {
    server.use(
      http.get(EVE_SCOUT_SIGNATURES_URL, () =>
        HttpResponse.json(SIGNATURES.filter((entry) => entry.id === 'jspace'))
      )
    );
    visitThera('');
    expect(
      await screen.findByText('No holes into K-space match these filters')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: JSPACE_GROUP })).toBeInTheDocument();
  });

  it('says so when EVE-Scout lists nothing', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json([])));
    visitThera('');
    expect(
      await screen.findByText('EVE-Scout lists no open connections right now')
    ).toBeInTheDocument();
  });

  it('says so when EVE-Scout cannot be reached', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new HttpResponse(null, { status: 500 })));
    visitThera('');
    expect(await screen.findByText(/Connections can.t be loaded right now/)).toBeInTheDocument();
  });

  it('asks EVE-Scout again from the unavailable state without a reload', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new HttpResponse(null, { status: 503 })));
    visitThera('');
    await screen.findByText(/Connections can.t be loaded right now/);

    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(SIGNATURES)));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table', { name: MAIN_TABLE })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers no Try again once the connections are listed', async () => {
    visitThera('');
    await screen.findByRole('table', { name: MAIN_TABLE });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('lets the hub-side signature be selected without opening the row', async () => {
    visitThera('');

    await screen.findByRole('table', { name: MAIN_TABLE });
    const signature = within(holeRow('uedama')).getByText('AAA-111');
    expect(signature).toHaveClass('select-all');
    fireEvent.click(signature);
    expect(holeRow('uedama')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows dense cards and filter chips on a phone', async () => {
    const matchMedia = stubPhone();
    try {
      const user = userEvent.setup();
      visitThera('');

      const table = await screen.findByRole('table', { name: MAIN_TABLE });
      expect(table).toHaveClass('dt-stacked', 'dt-stack-dense');
      expect(within(holeRow('perimeter')).getByText(/→ PER-002/)).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Exit' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Exit K-space' }));
      await user.click(await screen.findByRole('menuitemradio', { name: 'J-space' }));
      const jspace = await screen.findByRole('table', { name: JSPACE_TABLE });
      expect(holesIn(jspace)).toEqual(['jspace']);
      expect(window.location.search).toContain('space=wormhole');
    } finally {
      matchMedia.mockRestore();
    }
  });
});

describe('Travel copy', () => {
  it('states conditions, never verdicts', () => {
    const strings: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') strings.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    const catalog = en as unknown as Record<string, Record<string, unknown>>;
    // Everything the page shows: its own section, its nav entry, and the
    // Route Preference labels it borrows from Contract Search. Pilot Lookup
    // (`travel.pilot`) is checked by its own test: it names zKillboard's
    // "danger ratio" statistic, which is a figure, not a verdict.
    walk(Object.entries(catalog.travel).filter(([key]) => key !== 'pilot'));
    walk([catalog.nav.travel, (catalog.nav.groups as Record<string, string>).intel]);
    walk(catalog.contractSearch.routePreference);
    for (const text of strings) {
      expect(text, text).not.toMatch(/\b(safe|safest|unsafe|dangerous|danger|camp\w*)\b/i);
    }
  });
});
