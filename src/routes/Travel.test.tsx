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
import { configureClipboard } from '@/lib/clipboard';
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

const SYSTEMS = [
  { id: JITA, name: 'Jita', security: 0.9459, regionId: 10000002 },
  { id: PERIMETER, name: 'Perimeter', security: 0.95, regionId: 10000002 },
  { id: UEDAMA, name: 'Uedama', security: 0.505, regionId: 10000033 },
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
  http.get('https://zkillboard.com/api/kills/systemID/:id/pastSeconds/3600/', ({ params }) => {
    if (Number(params.id) === PERIMETER) return new HttpResponse(null, { status: 429 });
    if (Number(params.id) !== UEDAMA) return HttpResponse.json([]);
    const kill = (id: number, npc: boolean) => ({
      killmail_id: id,
      killmail_time: KILL_TIME,
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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
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
});

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

    const facts = within(screen.getByRole('list', { name: 'Route summary' }));
    expect(facts.getByText('Gank Chokepoints: Uedama')).toBeInTheDocument();
    expect(facts.getByText('2 jumps')).toBeInTheDocument();
    expect(facts.getByText('3 highsec / 0 lowsec / 0 nullsec')).toBeInTheDocument();
    expect(facts.getByText('lowest 0.5')).toBeInTheDocument();
    expect(facts.getByText('12 ship · 4 pod kills in the last hour')).toBeInTheDocument();
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
    await within(body[2]).findByRole('link', { name: '2 player kills' });
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
    const count = await uedama.findByRole('link', { name: '2 player kills' });
    expect(count).toHaveAttribute('href', `https://zkillboard.com/system/${UEDAMA}/`);
    expect(
      await uedama.findByText('2 kills at Stargate (Perimeter), last one 12 min ago')
    ).toBeInTheDocument();
    expect(uedama.getByText('On your route')).toBeInTheDocument();
    expect(uedama.getByText('Smartbombs involved')).toBeInTheDocument();

    // A rate-limited system says so on its own row; the rest still fill in.
    expect(await within(body[1]).findByText('zKillboard unavailable')).toBeInTheDocument();
    expect(
      await within(body[0]).findByRole('link', { name: '0 player kills' })
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

    const facts = within(screen.getByRole('list', { name: 'Route summary' }));
    expect(facts.getByText('8 jumps')).toBeInTheDocument();
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(9);

    await user.click(second);
    expect(screen.getByRole('table', { name: 'Systems on leg 2' })).toBeInTheDocument();
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
    expect(within(body[2]).getByText("ESI doesn't report wormhole space")).toBeInTheDocument();
    expect(
      within(body[1]).getByRole('button', { name: 'Copy signature JIT-001 in Jita' })
    ).toBeInTheDocument();

    const facts = within(screen.getByRole('list', { name: 'Route summary' }));
    expect(facts.getByText('2 jumps')).toBeInTheDocument();
    expect(facts.getByText('0 by gate')).toBeInTheDocument();
    expect(facts.getByText('2 through wormholes')).toBeInTheDocument();
    // Thera is counted as wormhole jumps, never as a nullsec system or the lowest security.
    expect(facts.getByText('2 highsec / 0 lowsec / 0 nullsec')).toBeInTheDocument();
    expect(facts.getByText('lowest 0.5')).toBeInTheDocument();
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
    expect(
      within(screen.getByRole('list', { name: 'Route summary' })).getByText('4 jumps')
    ).toBeInTheDocument();
  });

  it('never asks EVE-Scout with the switch off', async () => {
    const asked = vi.fn(() => HttpResponse.json(HOLES));
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, asked));
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    expect(
      within(screen.getByRole('list', { name: 'Route summary' })).getByText('4 jumps')
    ).toBeInTheDocument();
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
    expect(
      within(screen.getByRole('list', { name: 'Route summary' })).getByText('4 jumps')
    ).toBeInTheDocument();
  });
});

describe('Travel › Thera / Turnur', () => {
  afterEach(() => configureClipboard(null));

  function visitThera(search: string) {
    window.history.pushState({}, '', '/travel/thera' + search);
    render(<App />);
  }

  function band(name: RegExp) {
    return screen.findByRole('region', { name });
  }

  async function exitsIn(name: RegExp) {
    return within(await band(name))
      .queryAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
  }

  function card(exit: string) {
    return screen.getByRole('heading', { level: 4, name: exit }).closest('li')!;
  }

  it('groups live holes by where they come out, nearest first, hiding expired ones', async () => {
    visitThera('');

    expect(await screen.findByText('Jita (current system)')).toBeInTheDocument();
    await screen.findByText('1 jump');
    expect(within(await band(/^Highsec/)).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Highsec2'
    );
    expect(await exitsIn(/^Highsec/)).toEqual(['Perimeter', 'Uedama']);
    expect(await exitsIn(/^J-space/)).toEqual(['J120704']);
    expect(within(card('J120704')).getByText('No gate route')).toBeInTheDocument();
    expect(within(await band(/^Nullsec/)).getByText('No open holes into nullsec right now'));
    expect(screen.queryByRole('heading', { level: 4, name: 'Jita' })).not.toBeInTheDocument();

    const perimeter = within(card('Perimeter'));
    expect(perimeter.getByText('Turnur')).toBeInTheDocument();
    expect(perimeter.getByText('Up to Capital')).toBeInTheDocument();
    expect(perimeter.getByText('AAA-111')).toHaveClass('font-mono');
    expect(card('Perimeter')).toHaveAttribute('title', 'Wormhole type Q063');
  });

  it('shows a connection with two hours or less left in the warning color', async () => {
    visitThera('');

    await band(/^Highsec/);
    expect(within(card('Perimeter')).getByText(/left$/)).toHaveClass('text-warning');
    expect(within(card('Uedama')).getByText(/left$/)).not.toHaveClass('text-warning');
  });

  it('filters by hub from the URL, ignoring a legacy exit-space param', async () => {
    visitThera('?hub=thera&space=wormhole');
    expect(await exitsIn(/^Highsec/)).toEqual(['Uedama']);
    expect(await exitsIn(/^J-space/)).toEqual(['J120704']);
    expect(screen.getByRole('button', { name: 'Thera' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says an origin with no stargates reaches no exit by gate', async () => {
    visitThera(`?origin=${THERA}`);
    expect(
      await screen.findByText('Thera has no stargates, so no exit can be reached by gate from it.')
    ).toBeInTheDocument();
  });

  it('keeps only connections that pass at least the chosen ship size', async () => {
    visitThera('?size=capital');
    expect(await exitsIn(/^Highsec/)).toEqual(['Perimeter']);
    expect(within(await band(/^J-space/)).getByText('No open holes into J-space right now'));
  });

  it('says so when the filters leave no hole in any column', async () => {
    // Thera's two holes both stop at medium hulls.
    visitThera('?hub=thera&size=capital');
    expect(await screen.findByText('No connections match these filters')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Highsec/ })).not.toBeInTheDocument();
  });

  it('copies the hub-side signature', async () => {
    const write = vi.fn(async () => {});
    configureClipboard(write);
    visitThera('');

    await band(/^Highsec/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Thera signature for Uedama' }));
    expect(
      await screen.findByRole('button', { name: 'Copied Thera signature for Uedama' })
    ).toBeInTheDocument();
    expect(write).toHaveBeenCalledWith('AAA-111');
  });

  it('selects the signature to copy by hand when the clipboard refuses', async () => {
    configureClipboard(async () => {
      throw new Error('denied');
    });
    visitThera('');

    await band(/^Highsec/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Turnur signature for Perimeter' }));
    await waitFor(() => expect(window.getSelection()?.toString()).toBe('AAA-111'));
  });

  it('shows one band at a time under count tabs on a phone', async () => {
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
      visitThera('');

      const tabs = await screen.findByRole('tablist', { name: 'Where the holes come out' });
      expect(
        within(tabs)
          .getAllByRole('tab')
          .map((tab) => tab.textContent)
      ).toEqual(['High 2', 'Low 0', 'Null 0', 'J 1']);
      await screen.findByText('1 jump');
      expect(await exitsIn(/^Highsec/)).toEqual(['Perimeter', 'Uedama']);
      expect(screen.queryByRole('region', { name: /^J-space/ })).not.toBeInTheDocument();

      fireEvent.click(within(tabs).getByRole('tab', { name: 'J 1' }));
      expect(await exitsIn(/^J-space/)).toEqual(['J120704']);
    } finally {
      matchMedia.mockRestore();
    }
  });

  it('opens the phone tabs on the first band that has holes', async () => {
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
      server.use(
        http.get(EVE_SCOUT_SIGNATURES_URL, () =>
          HttpResponse.json(SIGNATURES.filter((entry) => entry.id === 'jspace'))
        )
      );
      visitThera('');
      const tabs = await screen.findByRole('tablist', { name: 'Where the holes come out' });
      expect(within(tabs).getByRole('tab', { name: 'J 1' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(await exitsIn(/^J-space/)).toEqual(['J120704']);
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
