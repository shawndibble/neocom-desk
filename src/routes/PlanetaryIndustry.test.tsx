import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
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

const PRODUCT_ID = 2288;

const NAMES: Record<number, { name: string; category: string }> = {
  [SYSTEM_ID]: { name: 'Jita', category: 'solar_system' },
  2848: { name: 'Extractor Control Unit', category: 'inventory_type' },
  [PRODUCT_ID]: { name: 'Felsic Magma', category: 'inventory_type' },
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
  http.post(`${ESI}/universe/names`, async ({ request }) => {
    const ids = (await request.json()) as number[];
    return HttpResponse.json(ids.filter((id) => NAMES[id]).map((id) => ({ id, ...NAMES[id] })));
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-planets.manage_planets.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/planetary-industry');
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
 * The per-colony panel for a planet, found by its own heading.
 *
 * The cross-character timeline above these panels names the same planets,
 * products and states, so a page-wide `getByText` is ambiguous here by
 * design — the two surfaces really do say the same words about the same
 * colony. An assertion about the pin table therefore says which panel it
 * means rather than loosening its counts.
 */
async function colonyPanelFor(name: RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name });
  const panel = heading.closest('section');
  if (!(panel instanceof HTMLElement)) throw new Error(`no colony panel for ${String(name)}`);
  return panel;
}

function timeline(): HTMLElement {
  return screen.getByRole('list', { name: /needing attention first/i });
}

describe('PlanetaryIndustry', () => {
  it('lists a colony with its planet, and shows the extractor as expired from expiry_time alone', async () => {
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('Extractor Control Unit')).toBeInTheDocument();
    expect(within(panel).getByText('Idle')).toBeInTheDocument();
    // Both the per-pin Status column and the Expires column read "Expired"
    // for an already-expired extractor.
    expect(within(panel).getAllByText('Expired')).toHaveLength(2);
  });

  it('explains the staleness rule in the UI', async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(
      screen.getByText(/only recalculates a colony's data when it's opened in the EVE client/)
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no colonies', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
    render(<App />);
    expect(await screen.findByText('No planetary colonies cached')).toBeInTheDocument();
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

  it('leaves both yield columns blank for an extractor with no install-time baseline', async () => {
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // The fixture's pin has an expiry but no qty_per_cycle/cycle_time/
    // install_time, so Banked and Reset now are the only em-dashed cells —
    // never a zero, which would read as "this program has produced nothing".
    expect(within(panel).getAllByText('—')).toHaveLength(2);
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
    expect(within(panel).getByText('+793,859/day')).toBeInTheDocument();
    expect(within(panel).queryByText('—')).not.toBeInTheDocument();
  });

  it('flags a colony whose extractors are all past the efficient window as decayed', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // Five days in, a trailing day of output runs at ~24% of the program's
    // first day — under EFFICIENT_WINDOW_FRACTION — while expiry is still nine
    // days out, so this is neither idle nor expiring-soon.
    expect(within(panel).getByText('Decayed')).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Idle')).not.toBeInTheDocument();
  });

  it('leaves a colony one day into its program healthy, not decayed', async () => {
    // The regression #316 exists for: on the old per-cycle read this colony
    // wore the badge four hours in, with 6% of a fortnight's output banked.
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(agedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('Healthy')).toBeInTheDocument();
    expect(within(panel).queryByText('Decayed')).not.toBeInTheDocument();
  });

  it('titles each stacked pin card by its product, not by the pin type on every row', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // `dt-primary` is what `.dt-stack` hoists as the card title below `sm`
    // (docs/DESIGN.md §4a) — "Extractor Control Unit" reads identically on
    // every extractor row and identifies nothing.
    expect(within(panel).getByText('Felsic Magma').closest('td')).toHaveClass('dt-primary');
    expect(within(panel).getByText('Extractor Control Unit').closest('td')).not.toHaveClass(
      'dt-primary'
    );
  });

  it('shows an unknown status rather than a confident Healthy when a colony detail failed to load', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () => HttpResponse.error())
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('Unknown')).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
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

    render(<App />);
    await colonyPanelFor(/Jita IV/);

    const rows = within(timeline()).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // Worst first: the active character's extractor has already expired, the
    // alt's runs for another five days.
    expect(rows[0]).toHaveTextContent('Pilot One');
    expect(rows[1]).toHaveTextContent('Alt Two');
    expect(altPlanetsFetch).not.toHaveBeenCalled();
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

    expect(scopelessFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Scopeless Alt/)).toHaveTextContent(/no planetary access/i);
    // The trap this guards: a live 403 on an alt raises the app-wide re-auth
    // banner, naming a character the player never asked about.
    expect(screen.queryByText('Log in again to see your colonies')).not.toBeInTheDocument();
  });

  it('reads an alt with nothing cached as "not loaded yet", never as having no colonies', async () => {
    await addAlt(92, 'Unread Alt', [PLANETS_SCOPE]);
    await addAlt(93, 'Empty Alt', [PLANETS_SCOPE]);
    await db.esiCache.put({ characterId: 93, key: 'planets', value: [], fetchedAt: Date.now() });

    render(<App />);
    await colonyPanelFor(/Jita IV/);

    const unread = screen.getByText(/Unread Alt/);
    const empty = screen.getByText(/Empty Alt/);
    expect(unread).not.toBe(empty);
    expect(unread).toHaveTextContent(/not loaded yet/i);
    expect(empty).toHaveTextContent(/No colonies/i);
  });
});
