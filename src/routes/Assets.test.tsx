import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { clearMarketPriceCache } from '@/market/prices';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useCompareSet } from '@/features/market/compareSet';
import { configureClipboard } from '@/lib/clipboard';
import { App } from '@/app/App';
import type { TypeMap } from '@/sde/types';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const TYPES: TypeMap = {
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  '650': { name: 'Drake', groupID: 27, volume: 92150 },
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

// Only reached by the "View in Market" navigation test below: Market Browser
// lazy-loads its own SDE payloads on mount, which this file otherwise never
// touches. Empty catalogues are enough to mount it without an unhandled fetch.
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => []),
  loadMarketTypes: vi.fn(async () => []),
  loadNpcStations: vi.fn(async () => []),
  loadSolarSystems: vi.fn(async () => []),
  loadMarketRegions: vi.fn(async () => []),
  loadGlobalMarkets: vi.fn(async () => []),
  loadAttributeDictionary: vi.fn(async () => new Map()),
}));

const CHAR_ID = 91;
const JITA = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
const STRUCTURE = 'Structure #1000000000001';

const assetPage1 = [
  {
    item_id: 1,
    type_id: 34,
    quantity: 500,
    location_id: 60003760,
    location_type: 'station' as const,
    location_flag: 'Hangar',
    is_singleton: false,
  },
];
const assetPage2 = [
  {
    item_id: 2,
    type_id: 35,
    quantity: 10,
    location_id: 1000000000001,
    location_type: 'other' as const,
    location_flag: 'Hangar',
    is_singleton: false,
  },
];

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
    const page = new URL(request.url).searchParams.get('page');
    return HttpResponse.json(page === '2' ? assetPage2 : assetPage1, {
      headers: { 'X-Pages': '2' },
    });
  }),
  http.get('https://esi.evetech.net/universe/stations/60003760', () =>
    HttpResponse.json({
      station_id: 60003760,
      name: JITA,
      type_id: 1531,
      system_id: 30000142,
    })
  ),
  // Security status (issue #148): every test's default station resolves to
  // this system, so its security fetch needs a default handler too, the same
  // way the station name lookup just above does.
  http.get('https://esi.evetech.net/universe/systems/30000142', () =>
    HttpResponse.json({ system_id: 30000142, name: 'Jita', security_status: 0.9459 })
  ),
  // This character's token predates esi-universe.read_structures.v1 (see the
  // token fixture below), so ESI 403s — the structure falls back to its bare
  // id label rather than triggering a re-auth banner.
  http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
    HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
  ),
  http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.json([])),
  // Jumps-away (issue #87): the active character starts in Jita's system
  // (30000142, same as the fixture station above), and any route call that
  // does end up needed (e.g. cross-character search reaching a different
  // system) gets a harmless generic route so no test has to know about it.
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/location`, () =>
    HttpResponse.json({ solar_system_id: 30000142 })
  ),
  http.get('https://esi.evetech.net/latest/route/:origin/:destination', ({ params }) =>
    HttpResponse.json([Number(params.origin), Number(params.destination)])
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
});
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.stationPins.clear();
  await db.buildPlans.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useCompareSet.setState({ items: [] });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-assets.read_assets.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/assets');
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Clicks the link into a location or container by its (partial) label. */
async function openLocation(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp
): Promise<void> {
  const matcher = typeof name === 'string' ? new RegExp(escapeRegExp(name)) : name;
  await user.click(await screen.findByRole('link', { name: matcher }));
}

/** The single back control in the breadcrumb header — steps up exactly one level. */
async function goBack(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /back one level/i }));
}

/** Every top-level location label currently on screen, in DOM order. */
function locationOrder(): string[] {
  return screen
    .getAllByText(new RegExp(`^(${JITA}|${STRUCTURE})$`))
    .map((el) => el.textContent ?? '');
}

describe('Assets', () => {
  it('lists locations at the root; drilling into one shows its contents', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    expect(screen.getByText(STRUCTURE)).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();

    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();

    await goBack(user);
    await openLocation(user, STRUCTURE);
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
  });

  it('resolves a solar-system location to its name instead of a raw system id', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') return HttpResponse.json(assetPage2, { headers: { 'X-Pages': '2' } });
        return HttpResponse.json(
          [
            ...assetPage1,
            {
              item_id: 3,
              type_id: 650,
              quantity: 1,
              location_id: 30003889,
              location_type: 'solar_system' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
          ],
          { headers: { 'X-Pages': '2' } }
        );
      }),
      http.get('https://esi.evetech.net/universe/systems/30003889', () =>
        HttpResponse.json({ system_id: 30003889, name: 'Amamake', security_status: 0.3 })
      )
    );

    render(<App />);

    expect(await screen.findByText('In space (Amamake)')).toBeInTheDocument();
  });

  it('labels a container/ship parent with its resolved type name instead of a raw item id', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 10,
              type_id: 650,
              quantity: 1,
              location_id: 60003760,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
            {
              item_id: 11,
              type_id: 34,
              quantity: 50,
              location_id: 10,
              location_type: 'item' as const,
              location_flag: 'Cargo',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    expect(await screen.findByRole('heading', { name: 'Drake' })).toBeInTheDocument();
  });

  it('falls back to the generic "Container" label when the parent item is unresolvable, and files it under Location unresolved', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 20,
              type_id: 34,
              quantity: 50,
              location_id: 999999999,
              location_type: 'item' as const,
              location_flag: 'Cargo',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      // The missing parent isn't a real structure either — the best-effort
      // structure lookup 403s, same as any other structure the character
      // can't see into, and the group stays a genuine orphan.
      http.get('https://esi.evetech.net/universe/structures/999999999', () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText(/Location unresolved/)).toBeInTheDocument();
    expect(screen.getByText('Container')).toBeInTheDocument();
  });

  it('resolves a missing parent to its real name when it turns out to be a structure ESI can still look up (e.g. a personal-hangar division ESI never returns its own asset row for)', async () => {
    const HANGAR_STRUCTURE = 'Badivefi - Tycho Brahe 18 HQ';
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 21,
              type_id: 653,
              quantity: 1,
              location_id: 1053725032929,
              location_type: 'item' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.get('https://esi.evetech.net/universe/structures/1053725032929', () =>
        HttpResponse.json({
          name: HANGAR_STRUCTURE,
          owner_id: 1,
          solar_system_id: 30000144,
        })
      )
    );
    render(<App />);
    expect(await screen.findByText(HANGAR_STRUCTURE)).toBeInTheDocument();
    expect(screen.queryByText(/Location unresolved/)).not.toBeInTheDocument();
    expect(screen.queryByText('Container')).not.toBeInTheDocument();
  });

  it('filters items via the search box, across every location at once', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    // Search is debounced (issue #415) — wait it out rather than reading
    // results synchronously right after typing, same convention as
    // SkillPicker.test.tsx.
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('clearing the search returns to the root location list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);

    const search = screen.getByPlaceholderText(/search items/i);
    const pinButton = new RegExp(`Pin toggle for ${escapeRegExp(JITA)}`);
    await user.type(search, 'tritanium');
    // A search result links to its location too, so its own text legitimately
    // includes "Jita IV…" — the root list's pin button is what only the root
    // list renders, so its absence is the real signal here.
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: pinButton })).not.toBeInTheDocument();

    await user.clear(search);
    expect(await screen.findByRole('button', { name: pinButton })).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('falls back to cached data offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'assets',
      value: assetPage1,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () => HttpResponse.error())
    );
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/showing cached data/i)).toBeInTheDocument();
    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
  });

  it('warns that the list is incomplete when a page fails mid-pagination (D4)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(assetPage1, { headers: { 'X-Pages': '2' } });
      })
    );
    render(<App />);
    expect(await screen.findByText(/incomplete data/i)).toBeInTheDocument();
  });

  it('shows no incomplete-data warning when every page came back', async () => {
    render(<App />);
    await screen.findByText(JITA);
    expect(screen.queryByText(/incomplete data/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no assets cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the assets scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your assets')).toBeInTheDocument();
    expect(screen.queryByText(/no assets cached/i)).not.toBeInTheDocument();
  });

  it('caps what is fetched and says so, when a character has more asset pages than the fetch cap', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        return HttpResponse.json([{ ...assetPage1[0], item_id: page }], {
          headers: { 'X-Pages': '30' },
        });
      })
    );
    render(<App />);
    expect(await screen.findByText(/only the first 25 assets were fetched/i)).toBeInTheDocument();
  });

  it('the truncation notice has a retry action, not just a bare notice (issue #415)', async () => {
    let requestCount = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        requestCount += 1;
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        return HttpResponse.json([{ ...assetPage1[0], item_id: page }], {
          headers: { 'X-Pages': '30' },
        });
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/only the first 25 assets were fetched/i);
    const requestsBeforeRetry = requestCount;

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(requestCount).toBeGreaterThan(requestsBeforeRetry));
  });

  it('virtualizes a large asset list, rendering far fewer rows than exist (issue #86)', async () => {
    const bigAssetList = Array.from({ length: 2000 }, (_, i) => ({
      item_id: i + 1,
      type_id: 34,
      quantity: 1,
      location_id: 60003760,
      location_type: 'station' as const,
      location_flag: 'Hangar',
      is_singleton: false,
    }));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(bigAssetList, { headers: { 'X-Pages': '1' } })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    // The jsdom scroll-container shim reports a fixed ~600px viewport at ~48px/row —
    // nowhere near the 2000 rows that exist, proving the virtualizer is windowing
    // rather than rendering everything.
    const rendered = await screen.findAllByText('Tritanium');
    expect(rendered.length).toBeLessThan(100);
  });

  it('shows the fetch-cap notice without a render-cap notice, now that rendering is virtualized', async () => {
    const PAGE_SIZE = 50;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        const pageItems = Array.from({ length: PAGE_SIZE }, (_, i) => ({
          ...assetPage1[0],
          item_id: (page - 1) * PAGE_SIZE + i + 1,
        }));
        return HttpResponse.json(pageItems, { headers: { 'X-Pages': '30' } });
      })
    );
    render(<App />);
    expect(await screen.findByText(/only the first 1250 assets were fetched/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Showing \d+ of \d+ assets\.$/)).not.toBeInTheDocument();
  });

  it('sorts sibling items alphabetically within a location, regardless of ESI response order', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 }, // Tritanium
            { ...assetPage1[0], item_id: 2, type_id: 35 }, // Pyerite
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    const names = screen.getAllByText(/^(Tritanium|Pyerite)$/).map((el) => el.textContent);
    expect(names).toEqual(['Pyerite', 'Tritanium']);
  });

  it('shows the singular "item" form of a container badge when it holds exactly one', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 10,
              type_id: 650,
              quantity: 1,
              location_id: 60003760,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
            {
              item_id: 11,
              type_id: 34,
              quantity: 1,
              location_id: 10,
              location_type: 'item' as const,
              location_flag: 'Cargo',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByRole('heading', { name: 'Drake' });
    expect(screen.getByText('1 item · 0 ISK')).toBeInTheDocument();
  });

  it('still renders cached assets when global market prices are unreachable', async () => {
    server.use(http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()));
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    await goBack(user);
    await openLocation(user, STRUCTURE);
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
  });

  it('nests a ship into named sub-bays, each a further level to drill into, with a nested-item badge', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 10,
              type_id: 650,
              quantity: 1,
              location_id: 60003760,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
            {
              item_id: 11,
              type_id: 34,
              quantity: 50,
              location_id: 10,
              location_type: 'item' as const,
              location_flag: 'Cargo',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);

    await screen.findByRole('heading', { name: 'Drake' });
    expect(screen.getByText('50 items · 0 ISK')).toBeInTheDocument();
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();

    await openLocation(user, 'Drake');
    expect(await screen.findByText('Cargo Hold')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await openLocation(user, 'Cargo Hold');
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();

    // Back walks up exactly one level per press: Cargo Hold -> Drake -> the
    // station's own contents -> the root list.
    await goBack(user); // now at Drake: its row is Cargo Hold
    expect(await screen.findByText('Cargo Hold')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await goBack(user); // now at the station: its row is Drake
    expect(await screen.findByRole('heading', { name: 'Drake' })).toBeInTheDocument();
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();

    await goBack(user); // now at the root list
    expect(
      await screen.findByRole('link', { name: new RegExp(escapeRegExp(JITA)) })
    ).toBeInTheDocument();
  });

  it('reports an unresolved bookmark rather than silently landing on the root', async () => {
    // A stale bookmark into a container that no longer has that item —
    // navigated straight to, not reached via in-app links.
    window.history.pushState({}, '', '/assets/60003760/i:999');
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('This location is gone')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to all locations' }));
    expect(await screen.findByText(JITA)).toBeInTheDocument();
  });
});

describe('station pins (issue #84)', () => {
  it('cycles a location pin unpinned -> character -> account -> unpinned, persisting to Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);
    const pinButton = await screen.findByRole('button', {
      name: new RegExp(`Pin toggle for ${escapeRegExp(JITA)}`),
    });

    await user.click(pinButton);
    await waitFor(async () => {
      expect(await db.stationPins.get(`${CHAR_ID}:60003760`)).toMatchObject({
        characterId: CHAR_ID,
        locationId: 60003760,
        scope: 'character',
      });
    });

    await user.click(pinButton);
    await waitFor(async () => {
      expect((await db.stationPins.get(`${CHAR_ID}:60003760`))?.scope).toBe('account');
    });

    await user.click(pinButton);
    await waitFor(async () => {
      expect(await db.stationPins.get(`${CHAR_ID}:60003760`)).toBeUndefined();
    });
  });

  it('sorts a pinned location to the top of the list, regardless of its label', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);

    const pinButton = screen.getByRole('button', {
      name: new RegExp(`Pin toggle for ${escapeRegExp(STRUCTURE)}`),
    });
    await user.click(pinButton);

    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
  });

  it('a pin scoped to a different character does not elevate the location for the active one', async () => {
    await db.stationPins.put({
      id: `999:1000000000001`,
      characterId: 999,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);
  });

  it('an account-wide pin elevates the location for every character', async () => {
    await db.stationPins.put({
      id: `999:1000000000001`,
      characterId: 999,
      locationId: 1000000000001,
      scope: 'account',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByText(JITA);
    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
  });
});

describe('item context menu (issue #83)', () => {
  it('opens the shared item context menu on right-click, with a View in Market action', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    expect(
      await screen.findByRole('menuitem', { name: 'No blueprint options' }, { timeout: 2000 })
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
  });

  it('adds an item to the Quickbar from the Assets context menu, persisting to Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));

    await waitFor(async () => {
      const record = await db.quickbars.get(String(CHAR_ID));
      expect(record?.items).toEqual([{ typeId: 34, name: 'Tritanium' }]);
    });
  });

  it('navigates to the Market Browser with the item preselected via View in Market', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    await user.click(screen.getByRole('menuitem', { name: 'View in Market' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/market');
    });
    expect(window.location.search).toContain('type=34');
  });

  it('offers "View in Industry as material" when an owned Build Plan consumes the item, and jumps to Industry', async () => {
    const user = userEvent.setup();
    const { loadBlueprints } = await import('@/sde/loadSde');
    vi.mocked(loadBlueprints).mockResolvedValueOnce({
      '9999': {
        name: 'Widget Blueprint',
        time: 100,
        materials: [{ typeID: 34, quantity: 10 }],
        products: [{ typeID: 9998, quantity: 1 }],
        skills: [],
      },
    });
    await db.buildPlans.add({
      id: 'bp-1',
      characterId: CHAR_ID,
      name: 'Widget run',
      blueprintTypeID: 9999,
      runs: 1,
      me: 0,
      te: 0,
      facility: 'npcStation',
      rigLevel: 'none',
      security: 'highsec',
      hubId: 'jita',
      updatedAt: 1,
    });
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    const action = await screen.findByRole('menuitem', { name: 'View in Industry as material' });
    await user.click(action);

    await waitFor(() => expect(window.location.pathname).toBe('/industry'));
  });

  it('omits "View in Industry as material" when no owned Build Plan consumes the item', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    await screen.findByRole('menuitem', { name: 'No blueprint options' });
    expect(
      screen.queryByRole('menuitem', { name: 'View in Industry as material' })
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
  });
});

describe('all items view, min-value filter, and sort (issue #414)', () => {
  beforeEach(() => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () =>
        HttpResponse.json([
          { type_id: 34, average_price: 5 }, // Tritanium stack: 500 x 5 = 2,500 ISK
          { type_id: 35, average_price: 5000 }, // Pyerite stack: 10 x 5,000 = 50,000 ISK
        ])
      )
    );
  });

  it('shows every item across every location, without drilling in, once toggled on', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All items' }));

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('hides items below the minimum value threshold', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);
    await user.click(screen.getByRole('button', { name: 'All items' }));
    await screen.findByText('Tritanium');

    await user.type(screen.getByLabelText('Minimum value'), '10000');

    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('sorts the flat list by value, highest first', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);
    await user.click(screen.getByRole('button', { name: 'All items' }));
    await screen.findByText('Tritanium');

    await user.click(screen.getByLabelText('Sort'));
    await user.click(await screen.findByRole('option', { name: 'Value' }));

    const names = screen.getAllByText(/^(Tritanium|Pyerite)$/).map((el) => el.textContent);
    expect(names).toEqual(['Pyerite', 'Tritanium']);
  });

  it('applies the same min-value filter and sort to active search results', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);
    await user.type(screen.getByPlaceholderText(/search items/i), 'i');
    await screen.findByText('Tritanium');

    await user.type(screen.getByLabelText('Minimum value'), '10000');

    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });
});

describe('cross-character search (issue #85)', () => {
  const CHAR_ID_2 = 92;

  beforeEach(async () => {
    // The active character (Pilot One) holds only Tritanium in this block;
    // Pyerite lives exclusively on Pilot Two, so "does the search reach
    // beyond the active character" is unambiguous.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(assetPage1, { headers: { 'X-Pages': '1' } })
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 200,
              type_id: 35,
              quantity: 3,
              location_id: 60003762,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.get('https://esi.evetech.net/universe/stations/60003762', () =>
        HttpResponse.json({
          station_id: 60003762,
          name: 'Amarr VIII - Emperor Family Academy',
          type_id: 1926,
          system_id: 30002187,
        })
      )
    );

    await db.characters.put({
      characterId: CHAR_ID_2,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await db.tokens.put({
      characterId: CHAR_ID_2,
      accessToken: 'access-token-2',
      refreshToken: 'refresh-2',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-assets.read_assets.v1'],
    });
  });

  it('does not show another character’s items until the toggle is turned on', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);

    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('reaches other characters once the toggle is on, tagging the match with a character badge', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);

    await user.click(screen.getByRole('button', { name: /search all characters/i }));
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');

    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
  });

  it('returns to single-character search once the toggle is turned back off', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);

    const toggle = screen.getByRole('button', { name: /search all characters/i });
    await user.click(toggle);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('caches the other characters’ assets — flipping the toggle off then on again for the same character does not refetch (issue #415)', async () => {
    let fetchCount = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, () => {
        fetchCount += 1;
        return HttpResponse.json(
          [
            {
              item_id: 200,
              type_id: 35,
              quantity: 3,
              location_id: 60003762,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        );
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);

    const toggle = screen.getByRole('button', { name: /search all characters/i });
    await user.click(toggle);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(fetchCount).toBe(1);

    await user.click(toggle);
    await user.click(toggle);
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(fetchCount).toBe(1);
  });

  it('explains why cross-character results are excluded from CSV export, only while they’re actually showing', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);

    await user.type(screen.getByPlaceholderText(/search items/i), 'tritanium');
    await screen.findByText('Tritanium');
    expect(screen.queryByText(/CSV export only includes this character/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /search all characters/i }));
    await user.clear(screen.getByPlaceholderText(/search items/i));
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');

    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByText(/CSV export only includes this character/i)).toBeInTheDocument();
  });
});

describe('jumps-away distance (issue #87)', () => {
  it('shows 0 jumps for a pinned location in the character’s own system, without a route call', async () => {
    const user = userEvent.setup();
    let routeCalled = false;
    server.use(
      http.get('https://esi.evetech.net/latest/route/:origin/:destination', () => {
        routeCalled = true;
        return HttpResponse.json([30000142]);
      })
    );
    render(<App />);
    const pinButton = await screen.findByRole('button', {
      name: new RegExp(`Pin toggle for ${escapeRegExp(JITA)}`),
    });
    await user.click(pinButton);

    expect(await screen.findByText('0 jumps')).toBeInTheDocument();
    expect(routeCalled).toBe(false);
  });

  it('shows jumps resolved from the ESI route waypoint list for a pinned structure', async () => {
    server.use(
      http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
        HttpResponse.json({
          name: 'A Structure',
          owner_id: 1,
          solar_system_id: 30002187,
        })
      ),
      http.get('https://esi.evetech.net/latest/route/30000142/30002187', () =>
        HttpResponse.json([30000142, 30002053, 30002187])
      )
    );
    await db.stationPins.put({
      id: `${CHAR_ID}:1000000000001`,
      characterId: CHAR_ID,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);

    expect(await screen.findByText('2 jumps')).toBeInTheDocument();
  });

  it('resolves jumps-away for an "in space" location from its own location id, instead of always showing 0', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 30,
              type_id: 650,
              quantity: 1,
              location_id: 30002187,
              location_type: 'solar_system' as const,
              location_flag: 'AutoFit',
              is_singleton: true,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.get('https://esi.evetech.net/universe/systems/30002187', () =>
        HttpResponse.json({ system_id: 30002187, name: 'Amamake', security_status: 0.3 })
      ),
      http.get('https://esi.evetech.net/latest/route/30000142/30002187', () =>
        HttpResponse.json([30000142, 30002053, 30002187])
      )
    );
    await db.stationPins.put({
      id: `${CHAR_ID}:30002187`,
      characterId: CHAR_ID,
      locationId: 30002187,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);

    expect(await screen.findByText('2 jumps')).toBeInTheDocument();
  });

  it('shows "-" with a reason tooltip when the destination system cannot be resolved', async () => {
    // Default handler 403s this structure, so its system id never resolves.
    await db.stationPins.put({
      id: `${CHAR_ID}:1000000000001`,
      characterId: CHAR_ID,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);

    const badge = await screen.findByTitle('No route found to this station.');
    expect(badge).toHaveTextContent('-');
  });

  it('shows "-" with a reason tooltip when the character\'s own location is unavailable', async () => {
    // A character who hasn't re-consented to esi-location.read_location.v1
    // yet (the default for every existing user until they next log in) —
    // this must degrade the badge, not trip the shell-wide re-auth banner.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/location`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    render(<App />);

    // Both visible locations degrade the same way — no pin needed for either.
    const badges = await screen.findAllByTitle('Character location unavailable.');
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) expect(badge).toHaveTextContent('-');
    expect(screen.queryByText('Log in again to see your assets')).not.toBeInTheDocument();
  });

  it('lets the user switch route preference, re-requesting the route with the new flag', async () => {
    const user = userEvent.setup();
    const seenFlags: (string | null)[] = [];
    server.use(
      http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
        HttpResponse.json({
          name: 'A Structure',
          owner_id: 1,
          solar_system_id: 30002187,
        })
      ),
      http.get('https://esi.evetech.net/latest/route/30000142/30002187', ({ request }) => {
        seenFlags.push(new URL(request.url).searchParams.get('flag'));
        return HttpResponse.json([30000142, 30002187]);
      })
    );
    await db.stationPins.put({
      id: `${CHAR_ID}:1000000000001`,
      characterId: CHAR_ID,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);
    await screen.findByText('1 jump');
    expect(seenFlags).toEqual(['shortest']);

    await user.click(screen.getByRole('combobox', { name: 'Route' }));
    await user.click(await screen.findByRole('option', { name: 'Safest' }));

    // ESI's real flag enum is shortest/secure/insecure — "Safest" is this
    // app's own UI wording, translated to ESI's "secure" at the boundary.
    await waitFor(() => expect(seenFlags).toEqual(['shortest', 'secure']));
  });
});

describe('location sort (issue #88)', () => {
  // Default fixture: Jita holds 500 Tritanium (type 34), the structure holds
  // 10 Pyerite (type 35) — pricing Pyerite far above Tritanium makes the
  // structure's estimated value the larger one while its name still sorts
  // after Jita's, so a switch to "Value" is only visible if sorting actually
  // changed rather than leaving the default alphabetical order in place.
  function priceStructureAboveJita() {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () =>
        HttpResponse.json([
          { type_id: 34, adjusted_price: 1, average_price: 1 },
          { type_id: 35, adjusted_price: 10_000, average_price: 10_000 },
        ])
      )
    );
  }

  it('defaults to sorting locations by name', async () => {
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Name');
  });

  it('re-sorts the location list by estimated value when "Value" is selected', async () => {
    const user = userEvent.setup();
    priceStructureAboveJita();
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByRole('option', { name: 'Value' }));

    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
  });

  it('keeps a pinned location on top even under a "Value" sort it would otherwise lose', async () => {
    const user = userEvent.setup();
    priceStructureAboveJita();
    await db.stationPins.put({
      id: `${CHAR_ID}:60003760`,
      characterId: CHAR_ID,
      locationId: 60003760,
      scope: 'character',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByText(JITA);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByRole('option', { name: 'Value' }));

    await waitFor(() => {
      expect(locationOrder()).toEqual([JITA, STRUCTURE]);
    });
  });

  it('persists the chosen sort field across a remount', async () => {
    const user = userEvent.setup();
    priceStructureAboveJita();
    const { unmount } = render(<App />);
    await screen.findByText(JITA);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByRole('option', { name: 'Value' }));
    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
    unmount();

    render(<App />);
    await screen.findByText(JITA);
    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Value');
  });
});

describe('multi-select and bulk actions (issue #90)', () => {
  afterEach(() => configureClipboard(null));

  it('shows no checkboxes in browsing mode; toggling select mode reveals them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(JITA);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Select' }));

    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('checking a ship/container node cascades selection to all of its descendant items', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 10,
              type_id: 650,
              quantity: 1,
              location_id: 60003760,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
            {
              item_id: 11,
              type_id: 34,
              quantity: 50,
              location_id: 10,
              location_type: 'item' as const,
              location_flag: 'Cargo',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByRole('heading', { name: 'Drake' });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Drake and its contents' }));

    expect(await screen.findByText('1 item selected')).toBeInTheDocument();
  });

  it('turning off select mode clears the current selection', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    expect(await screen.findByText('1 item selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select' }));

    expect(screen.queryByText('1 item selected')).not.toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it('adds every selected item to the Quickbar via the bulk action bar', async () => {
    // Both items at one location so both are on screen together — the
    // default fixture spreads them across two locations on purpose, to keep
    // the location-scoping tests unambiguous.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Pyerite' }));
    await user.click(screen.getByRole('button', { name: 'Add to Quickbar' }));

    await waitFor(async () => {
      const record = await db.quickbars.get(String(CHAR_ID));
      expect(record?.items).toEqual([
        { typeId: 34, name: 'Tritanium' },
        { typeId: 35, name: 'Pyerite' },
      ]);
    });
  });

  it('adds every selected item to the Compare set via the bulk action bar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    await user.click(screen.getByRole('button', { name: 'Add to Compare' }));

    expect(useCompareSet.getState().items).toEqual([{ typeId: 34, itemName: 'Tritanium' }]);
  });

  it('copies every selected item’s name, newline-separated, to the clipboard', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Pyerite' }));
    await user.click(screen.getByRole('button', { name: 'Copy names' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Tritanium\nPyerite');
    });
  });

  it('"Select all in view" selects every item at the current level without needing to check each one (issue #415)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all in view' }));

    expect(await screen.findByText('2 items selected')).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked();
    }
  });

  it('"Deselect all" clears the selection in one action', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all in view' }));
    expect(await screen.findByText('2 items selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deselect all' }));

    expect(screen.queryByText(/items selected/)).not.toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it('"Deselect all" is disabled until something is selected', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');

    await user.click(screen.getByRole('button', { name: 'Select' }));

    expect(screen.getByRole('button', { name: 'Deselect all' })).toBeDisabled();
  });
});
