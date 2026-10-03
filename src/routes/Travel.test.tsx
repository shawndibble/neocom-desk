import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const SYSTEMS = [
  { id: JITA, name: 'Jita', security: 0.9459, regionId: 10000002 },
  { id: PERIMETER, name: 'Perimeter', security: 0.95, regionId: 10000002 },
  { id: UEDAMA, name: 'Uedama', security: 0.505, regionId: 10000033 },
  { id: THERA, name: 'Thera', security: -0.99, regionId: 11000031 },
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

    expect(screen.getByText('Passes through Gank Chokepoints: Uedama')).toBeInTheDocument();
    expect(screen.getByText('2 jumps from start to destination')).toBeInTheDocument();
    expect(
      screen.getByText('Last hour along the route: 12 ship kills, 4 pod kills')
    ).toBeInTheDocument();
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
