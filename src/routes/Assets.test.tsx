import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
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
  )
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

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no assets cached/i)).toBeInTheDocument();
  });
});
