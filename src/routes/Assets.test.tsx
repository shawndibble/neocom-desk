import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { clearMarketPriceCache } from '@/market/prices';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import type { TypeMap } from '@/sde/types';
import { MAX_RENDERED_ASSETS } from './Assets';

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
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      type_id: 1531,
      system_id: 30000142,
    })
  ),
  // This character's token predates esi-universe.read_structures.v1 (see the
  // token fixture below), so ESI 403s — the structure falls back to its bare
  // id label rather than triggering a re-auth banner.
  http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
    HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
  ),
  http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.json([]))
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
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

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

describe('Assets', () => {
  it('groups items by location, resolving a station name and showing "Structure #id" for the rest', async () => {
    render(<App />);
    expect(
      await screen.findByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant')
    ).toBeInTheDocument();
    expect(await screen.findByText('Structure #1000000000001')).toBeInTheDocument();
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
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
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Drake' })).toBeInTheDocument();
  });

  it('falls back to the generic "Container" label when the parent item is unresolvable', async () => {
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
      )
    );
    render(<App />);
    expect(await screen.findByText('Container')).toBeInTheDocument();
  });

  it('filters items via the search box', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Tritanium');
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('auto-expands ancestors of a search match, then collapses back to default once the search clears', async () => {
    const user = userEvent.setup();
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
    render(<App />);
    await screen.findByRole('heading', { name: 'Drake' });
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();

    const search = screen.getByPlaceholderText(/search items/i);
    await user.type(search, 'tritanium');
    expect(await screen.findByText('Cargo Hold')).toBeInTheDocument();
    expect(screen.getByText('Tritanium')).toBeInTheDocument();

    await user.clear(search);
    expect(await screen.findByRole('heading', { name: 'Drake' })).toBeInTheDocument();
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();
  });

  it('restores a manually-expanded branch after the search clears', async () => {
    const user = userEvent.setup();
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
    render(<App />);
    const shipHeading = await screen.findByRole('heading', { name: 'Drake' });
    await user.click(shipHeading.closest('button')!);
    await user.click(await screen.findByText('Cargo Hold'));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();

    const search = screen.getByPlaceholderText(/search items/i);
    await user.type(search, 'zzz-no-match');
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();

    await user.clear(search);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
  });

  it('ignores a click on an auto-expanded row during search, so it does not corrupt the state search restores to', async () => {
    const user = userEvent.setup();
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
    render(<App />);
    await screen.findByRole('heading', { name: 'Drake' });
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();

    const search = screen.getByPlaceholderText(/search items/i);
    await user.type(search, 'tritanium');
    const cargoHold = await screen.findByText('Cargo Hold');
    // A user might reasonably try to collapse the auto-opened row while searching;
    // that click must not mutate the hidden expand state search restores to on clear.
    await user.click(cargoHold);

    await user.clear(search);
    expect(await screen.findByRole('heading', { name: 'Drake' })).toBeInTheDocument();
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();
  });

  it('falls back to cached data offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'assets',
      value: assetPage1,
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
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
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText(/incomplete data/i)).toBeInTheDocument();
  });

  it('shows no incomplete-data warning when every page came back', async () => {
    render(<App />);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
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

  it('caps what is rendered and says so, when the fetched list is larger than the render cap', async () => {
    const bigAssetList = Array.from({ length: MAX_RENDERED_ASSETS + 1 }, (_, i) => ({
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
    render(<App />);
    expect(
      await screen.findByText(
        `Showing ${MAX_RENDERED_ASSETS} of ${MAX_RENDERED_ASSETS + 1} assets.`
      )
    ).toBeInTheDocument();
  });

  it('shows both notices when a character trips the fetch cap and the render cap at once', async () => {
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
    expect(screen.getByText(`Showing ${MAX_RENDERED_ASSETS} of 1250 assets.`)).toBeInTheDocument();
  });

  it('sorts sibling items alphabetically within a station, regardless of ESI response order', async () => {
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
    render(<App />);
    await screen.findByText('Tritanium');
    const names = screen.getAllByText(/Tritanium|Pyerite/).map((el) => el.textContent);
    expect(names).toEqual(['Pyerite', 'Tritanium']);
  });

  it('shows the singular "item" form of the badge when a node holds exactly one', async () => {
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
    render(<App />);
    await screen.findByRole('heading', { name: 'Drake' });
    expect(screen.getByText('1 item · 0 ISK')).toBeInTheDocument();
  });

  it('still renders cached assets when global market prices are unreachable', async () => {
    server.use(http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('nests a ship into named sub-bays, collapsed by default, with a nested-item badge', async () => {
    const user = userEvent.setup();
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
    render(<App />);

    const shipHeading = await screen.findByRole('heading', { name: 'Drake' });
    expect(screen.getByText('50 items · 0 ISK')).toBeInTheDocument();
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();

    await user.click(shipHeading.closest('button')!);
    expect(await screen.findByText('Cargo Hold')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await user.click(screen.getByText('Cargo Hold'));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
  });

  it('expand all / collapse all at the station level opens or closes every nested node at once', async () => {
    const user = userEvent.setup();
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
    render(<App />);
    await screen.findByRole('heading', { name: 'Drake' });
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand all/i }));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });
});

describe('station pins (issue #84)', () => {
  const JITA = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
  const STRUCTURE = 'Structure #1000000000001';

  function stationOrder(): string[] {
    return screen
      .getAllByRole('heading', { name: new RegExp(`^(${JITA}|${STRUCTURE})$`) })
      .map((h) => h.textContent);
  }

  it('cycles a station pin unpinned -> character -> account -> unpinned, persisting to Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);
    const pinButton = await screen.findByRole('button', {
      name: new RegExp(`Pin toggle for ${JITA}`),
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

  it('sorts a pinned station to the top of the list, regardless of its label', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: JITA });
    expect(stationOrder()).toEqual([JITA, STRUCTURE]);

    const pinButton = screen.getByRole('button', {
      name: new RegExp(`Pin toggle for ${STRUCTURE}`),
    });
    await user.click(pinButton);

    await waitFor(() => {
      expect(stationOrder()).toEqual([STRUCTURE, JITA]);
    });
  });

  it('a pin scoped to a different character does not elevate the station for the active one', async () => {
    await db.stationPins.put({
      id: `999:1000000000001`,
      characterId: 999,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByRole('heading', { name: JITA });
    expect(stationOrder()).toEqual([JITA, STRUCTURE]);
  });

  it('an account-wide pin elevates the station for every character', async () => {
    await db.stationPins.put({
      id: `999:1000000000001`,
      characterId: 999,
      locationId: 1000000000001,
      scope: 'account',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByRole('heading', { name: JITA });
    expect(stationOrder()).toEqual([STRUCTURE, JITA]);
  });

  it('a pinned station with nested nodes starts expanded on page load', async () => {
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
    await db.stationPins.put({
      id: `${CHAR_ID}:60003760`,
      characterId: CHAR_ID,
      locationId: 60003760,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Drake' });
    expect(await screen.findByText('Cargo Hold')).toBeInTheDocument();
  });
});

describe('item tooltip and context menu (issue #83)', () => {
  it('shows a tooltip with name, icon, quantity, estimated value and volume on hover', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 30,
              type_id: 650,
              quantity: 1,
              location_id: 60003760,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.get('https://esi.evetech.net/markets/prices', () =>
        HttpResponse.json([{ type_id: 650, adjusted_price: 1000000, average_price: 1200000 }])
      )
    );
    const user = userEvent.setup();
    render(<App />);

    const name = await screen.findByText('Drake');
    await user.hover(name);

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Drake')).toBeInTheDocument();
    expect(within(tooltip).getByText(/Qty 1/)).toBeInTheDocument();
    expect(within(tooltip).getByText('Value: 1,200,000 ISK')).toBeInTheDocument();
    expect(within(tooltip).getByText('Volume: 92,150 m3')).toBeInTheDocument();
    expect(tooltip.querySelector('img')?.getAttribute('src')).toContain('/types/650/icon');

    await user.unhover(name);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the volume as unknown for a type outside the slim SDE snapshot', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 40,
              type_id: 999,
              quantity: 3,
              location_id: 60003760,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.post('https://esi.evetech.net/universe/names', () =>
        HttpResponse.json([{ id: 999, name: 'Mystery Module', category: 'inventory_type' }])
      )
    );
    const user = userEvent.setup();
    render(<App />);

    const name = await screen.findByText('Mystery Module');
    await user.hover(name);

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Volume: unknown')).toBeInTheDocument();
  });

  it('opens the shared item context menu on right-click, with a View in Market action', async () => {
    const user = userEvent.setup();
    render(<App />);
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
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    await user.click(screen.getByRole('menuitem', { name: 'View in Market' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/market');
    });
    expect(window.location.search).toContain('type=34');
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
    await screen.findByText('Tritanium');

    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('reaches other characters once the toggle is on, tagging the match with a character badge', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Tritanium');

    await user.click(screen.getByRole('button', { name: /search all characters/i }));
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');

    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
  });

  it('returns to single-character search once the toggle is turned back off', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Tritanium');

    const toggle = screen.getByRole('button', { name: /search all characters/i });
    await user.click(toggle);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });
});
