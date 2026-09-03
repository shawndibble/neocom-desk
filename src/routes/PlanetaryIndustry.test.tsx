import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
 */
const BASE_NOW = Date.now();
const DAY_MS = 86_400_000;

const decayedDetailPayload = {
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

describe('PlanetaryIndustry', () => {
  it('lists a colony with its planet, and shows the extractor as expired from expiry_time alone', async () => {
    render(<App />);
    expect(await screen.findByText(/Jita IV/)).toBeInTheDocument();
    expect(screen.getByText('Extractor Control Unit')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    // Both the per-pin Status column and the Expires column read "Expired"
    // for an already-expired extractor.
    expect(screen.getAllByText('Expired')).toHaveLength(2);
  });

  it('explains the staleness rule in the UI', async () => {
    render(<App />);
    await screen.findByText(/Jita IV/);
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
    await screen.findByText(/Jita IV/);
    // The fixture's pin has an expiry but no qty_per_cycle/cycle_time/
    // install_time, so Banked and Reset now are the only em-dashed cells —
    // never a zero, which would read as "this program has produced nothing".
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('0 (0%)')).not.toBeInTheDocument();
  });

  it('shows banked yield, its share of the program, and the daily gain from resetting now', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    await screen.findByText(/Jita IV/);
    expect(screen.getByText('513,262 (27%)')).toBeInTheDocument();
    expect(screen.getByText('+793,859/day')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('flags a colony whose extractors are all past the efficient window as decayed', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    await screen.findByText(/Jita IV/);
    // A day in, the current cycle yields ~32% of the program's first — under
    // EFFICIENT_WINDOW_FRACTION — while expiry is still 13 days out, so this
    // is neither idle nor expiring-soon.
    expect(screen.getByText('Decayed')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
    expect(screen.queryByText('Idle')).not.toBeInTheDocument();
  });

  it('titles each stacked pin card by its product, not by the pin type on every row', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    await screen.findByText(/Jita IV/);
    // `dt-primary` is what `.dt-stack` hoists as the card title below `sm`
    // (docs/DESIGN.md §4a) — "Extractor Control Unit" reads identically on
    // every extractor row and identifies nothing.
    expect(screen.getByText('Felsic Magma').closest('td')).toHaveClass('dt-primary');
    expect(screen.getByText('Extractor Control Unit').closest('td')).not.toHaveClass('dt-primary');
  });

  it('shows an unknown status rather than a confident Healthy when a colony detail failed to load', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () => HttpResponse.error())
    );
    render(<App />);
    await screen.findByText(/Jita IV/);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });
});
