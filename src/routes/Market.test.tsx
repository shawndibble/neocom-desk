import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useMarketHub } from '@/features/market/hub';
import { clearOrderBookCache } from '@/features/market/orderBook';
import { ESI_BASE_URL } from '@/esi/client';
import { App } from '@/app/App';
import { Market } from './Market';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
} from '@/sde/marketTypes';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const GROUPS: MarketGroupNode[] = [
  { id: 1, name: 'Ships', parentId: null, hasTypes: false },
  { id: 2, name: 'Frigates', parentId: 1, hasTypes: true },
  { id: 3, name: 'Ore', parentId: null, hasTypes: true },
];
const TYPES: MarketTypeEntry[] = [
  { typeId: 587, name: 'Rifter', marketGroupId: 2 },
  { typeId: 34, name: 'Tritanium', marketGroupId: 3 },
];
const STATIONS: NpcStationEntry[] = [
  { id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 },
];

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => GROUPS),
  loadMarketTypes: vi.fn(async () => TYPES),
  loadNpcStations: vi.fn(async () => STATIONS),
  loadSolarSystems: vi.fn(async () => SYSTEMS),
}));

const RIFTER_REGION_ID = 10000002; // The Forge (Jita hub's region)

function ordersHandler(hits: { count: number }) {
  return http.get(`${ESI_BASE_URL}/markets/${RIFTER_REGION_ID}/orders`, () => {
    hits.count += 1;
    return HttpResponse.json(
      [
        {
          order_id: 1,
          type_id: 587,
          is_buy_order: false,
          price: 1000000,
          location_id: 60003760, // Jita 4-4, a known NPC station
          system_id: 30000142,
          volume_remain: 5,
          volume_total: 10,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: 'region',
        },
        {
          order_id: 2,
          type_id: 587,
          is_buy_order: true,
          price: 500000,
          location_id: 1035466617946, // player structure, not in STATIONS
          system_id: 30000142,
          volume_remain: 3,
          volume_total: 3,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: '5',
        },
      ],
      { headers: { 'X-Pages': '1' } }
    );
  });
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  // Market needs no ESI scope and no *active* Character, but the feature area
  // sits behind RequireCharacter, so one must exist for the route to render.
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  clearOrderBookCache();
  window.history.pushState({}, '', '/market');
});

describe('Market Browser', () => {
  it('filters the Market Group tree in place, hiding branches with no match', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Ships')).toBeInTheDocument();
    expect(screen.getByText('Ore')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'rift');

    expect(await screen.findByText('Rifter')).toBeInTheDocument();
    expect(screen.getByText('Ships')).toBeInTheDocument();
    expect(screen.queryByText('Ore')).not.toBeInTheDocument();
  });

  it('prompts to search or browse when nothing is selected', async () => {
    render(<App />);
    expect(await screen.findByText('Select an item')).toBeInTheDocument();
  });

  it('selecting an item loads its order book: separate sell/buy tables, sorted, with Data Age', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('1,000,000.00')).toBeInTheDocument();
    expect(
      within(sellTable).getByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant', {
        exact: false,
      })
    ).toBeInTheDocument();

    const buyTable = await screen.findByRole('table', { name: 'Buy Orders' });
    expect(within(buyTable).getByText('500,000.00')).toBeInTheDocument();
    // Player-structure order is never dropped — shown with an unknown-structure label.
    expect(within(buyTable).getByText('Unknown Structure', { exact: false })).toBeInTheDocument();
    expect(within(buyTable).getByText('Jita (0.9)', { exact: false })).toBeInTheDocument();

    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('Refresh bypasses the 300s order-book cache and refetches immediately', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });
    expect(hits.count).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await vi.waitFor(() => expect(hits.count).toBe(2));
  });
});

describe('Market search focus (issue #25 "jump to search" shortcut)', () => {
  it('focuses the search box when navigated here with focusSearch router state', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/market', state: { focusSearch: true } }]}>
        <Market />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('leaves focus alone on an ordinary visit', async () => {
    render(
      <MemoryRouter initialEntries={['/market']}>
        <Market />
      </MemoryRouter>
    );

    expect(await screen.findByRole('searchbox')).not.toHaveFocus();
  });
});
