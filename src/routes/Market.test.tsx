import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useMarketHub } from '@/features/market/hub';
import { useLocationMode, DEFAULT_LOCATION_MODE } from '@/features/market/locationMode';
import { clearOrderBookCache } from '@/features/market/orderBook';
import { ESI_BASE_URL } from '@/esi/client';
import { configureClipboard } from '@/lib/clipboard';
import { App } from '@/app/App';
import { Market } from './Market';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
  MarketRegionEntry,
  GlobalMarketEntry,
} from '@/sde/marketTypes';
import type { BlueprintMap, TypeMap } from '@/sde/types';

// Rifter (typeId 587, the market TYPES fixture below) has a blueprint;
// Tritanium (typeId 34) doesn't — exercises the item context menu's Build
// Plan action in both states (issue #6).
const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [{ typeID: 34, quantity: 4500 }],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
  },
};
const SDE_TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadTypes: vi.fn(async () => SDE_TYPES),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const PLEX_TYPE_ID = 44992;
const GPMR_REGION_ID = 19000001;

const GROUPS: MarketGroupNode[] = [
  { id: 1, name: 'Ships', parentId: null, hasTypes: false },
  { id: 2, name: 'Frigates', parentId: 1, hasTypes: true },
  { id: 3, name: 'Ore', parentId: null, hasTypes: true },
];
const TYPES: MarketTypeEntry[] = [
  { typeId: 587, name: 'Rifter', marketGroupId: 2 },
  { typeId: 34, name: 'Tritanium', marketGroupId: 3 },
  { typeId: PLEX_TYPE_ID, name: 'PLEX', marketGroupId: 3 },
];
const STATIONS: NpcStationEntry[] = [
  { id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 },
];
const REGIONS: MarketRegionEntry[] = [
  { id: 10000002, name: 'The Forge' },
  { id: 10000043, name: 'Domain' },
];
const GLOBAL_MARKETS: GlobalMarketEntry[] = [
  { typeId: PLEX_TYPE_ID, regionId: GPMR_REGION_ID, regionName: 'GPMR-01' },
];

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => GROUPS),
  loadMarketTypes: vi.fn(async () => TYPES),
  loadNpcStations: vi.fn(async () => STATIONS),
  loadSolarSystems: vi.fn(async () => SYSTEMS),
  loadMarketRegions: vi.fn(async () => REGIONS),
  loadGlobalMarkets: vi.fn(async () => GLOBAL_MARKETS),
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
          location_id: 60003760, // Jita 4-4, the hub's own station
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
          location_id: 60003760, // Jita 4-4, the hub's own station
          system_id: 30000142,
          volume_remain: 3,
          volume_total: 3,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: '5',
        },
        {
          order_id: 3,
          type_id: 587,
          is_buy_order: false,
          price: 2000000,
          location_id: 1035466617946, // player structure elsewhere in the region, not in STATIONS
          system_id: 30000142,
          volume_remain: 1,
          volume_total: 1,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: 'region',
        },
      ],
      { headers: { 'X-Pages': '1' } }
    );
  });
}

function plexOrdersHandler(hits: { count: number }) {
  return http.get(`${ESI_BASE_URL}/markets/${GPMR_REGION_ID}/orders`, () => {
    hits.count += 1;
    return HttpResponse.json(
      [
        {
          order_id: 10,
          type_id: PLEX_TYPE_ID,
          is_buy_order: false,
          price: 3000000,
          location_id: 60003760, // PLEX orders still carry ordinary station ids
          system_id: 30000142,
          volume_remain: 267,
          volume_total: 267,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: 'region',
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
  await db.quickbars.clear();
  // Market needs no ESI scope and no *active* Character, but the feature area
  // sits behind RequireCharacter, so one must exist for the route to render.
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  useLocationMode.setState({ value: DEFAULT_LOCATION_MODE, hydrated: false });
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

describe('Market Browser item context menu (issue #6)', () => {
  beforeEach(async () => {
    // Ordinary usage always has an active character; Add to Quickbar is
    // enabled in that state (see the "Quickbar (issue #7)" describe block
    // below for the no-active-character edge case).
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
  });
  afterEach(() => configureClipboard(null));

  it('opens on right-click with all five actions, two disabled until their target ships', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    item.focus();
    fireEvent.contextMenu(item);

    expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).not.toHaveAttribute(
      'data-disabled'
    );
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toHaveAttribute(
      'data-disabled'
    );
    expect(screen.getByRole('menuitem', { name: 'Copy name' })).not.toHaveAttribute(
      'data-disabled'
    );

    // Build Plan starts unresolved (blueprint catalog not requested until the
    // menu opens) then flips to enabled once it resolves — Rifter has one.
    expect(
      await screen.findByRole('menuitem', { name: 'Build Plan' }, { timeout: 2000 })
    ).not.toHaveAttribute('data-disabled');

    await user.keyboard('{Escape}');
  });

  it('shows "No blueprint options" disabled for an item no blueprint produces', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'trit');
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    expect(
      await screen.findByRole('menuitem', { name: 'No blueprint options' }, { timeout: 2000 })
    ).toHaveAttribute('data-disabled');
  });

  it('copies the item name to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    item.focus();
    fireEvent.contextMenu(item);

    await user.click(screen.getByRole('menuitem', { name: 'Copy name' }));
    expect(writeText).toHaveBeenCalledWith('Rifter');
  });
});

describe('Quickbar unavailable with no active character (issue #7)', () => {
  it('disables Add to Quickbar with an explanatory title', async () => {
    // Ambient state from the outer beforeEach: no active character.
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    item.focus();
    fireEvent.contextMenu(item);

    const menuItem = screen.getByRole('menuitem', { name: 'Add to Quickbar' });
    expect(menuItem).toHaveAttribute('data-disabled');
    expect(menuItem).toHaveAttribute('title', 'Select a character to use the Quickbar');
  });
});

describe('Quickbar (issue #7)', () => {
  beforeEach(async () => {
    // App.tsx re-hydrates useActiveCharacter from Dexie on every mount, which
    // would clobber a direct store setState — seed the setting it reads instead.
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
  });

  it('shows a short hint when empty', async () => {
    render(<App />);
    expect(await screen.findByText(/No items yet/)).toBeInTheDocument();
  });

  it('adds an item from its context menu, and a re-add does not duplicate it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    item.focus();
    fireEvent.contextMenu(item);
    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));

    const quickbar = (await screen.findByRole('heading', { name: 'Quickbar' })).closest('div')!;
    await waitFor(() => expect(within(quickbar).getAllByText('Rifter')).toHaveLength(1));

    fireEvent.contextMenu(item);
    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));
    await waitFor(() => expect(within(quickbar).getAllByText('Rifter')).toHaveLength(1));
  });

  it('removes an item, restoring the empty hint', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    item.focus();
    fireEvent.contextMenu(item);
    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));
    await screen.findByRole('button', { name: 'Remove Rifter from Quickbar' });

    await user.click(screen.getByRole('button', { name: 'Remove Rifter from Quickbar' }));

    expect(await screen.findByText(/No items yet/)).toBeInTheDocument();
  });

  it('clicking a Quickbar item selects it and loads its order book', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    item.focus();
    fireEvent.contextMenu(item);
    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));

    // Clear the search so the tree's own collapsed "Rifter" row is gone,
    // leaving the Quickbar's row as the only "Rifter" button.
    await user.clear(screen.getByRole('searchbox'));
    await waitFor(() => expect(screen.getAllByText('Rifter')).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Rifter' }));

    await screen.findByRole('table', { name: 'Sell Orders' });
  });

  it('survives a reload from local storage alone (Firebase sync is not configured in tests)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    item.focus();
    fireEvent.contextMenu(item);
    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));
    await screen.findByRole('button', { name: 'Remove Rifter from Quickbar' });
    unmount();

    render(<App />);
    const quickbar = (await screen.findByRole('heading', { name: 'Quickbar' })).closest('div')!;
    expect(await within(quickbar).findByText('Rifter')).toBeInTheDocument();
  });
});

describe('Market Browser order row context menu (issue #6)', () => {
  afterEach(() => configureClipboard(null));

  it('copies the location and price to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    // Default Trade Hub mode already narrows to Jita 4-4, so the sell table
    // has exactly one row here (order 3, the player-structure sell, is
    // filtered out by the hub itself, not by the context-menu action below).
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    const [, sellRow] = within(sellTable).getAllByRole('row');
    sellRow.focus();
    fireEvent.contextMenu(sellRow);

    await user.click(await screen.findByRole('menuitem', { name: 'Copy location' }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Jita IV - Moon 4 - Caldari Navy Assembly Plant')
    );

    fireEvent.contextMenu(sellRow);
    await user.click(await screen.findByRole('menuitem', { name: 'Copy price' }));
    expect(writeText).toHaveBeenCalledWith('1,000,000.00 ISK');
  });

  it('filters the book to one station, undone via the banner', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });
    // Region mode surfaces both sell orders (Jita 4-4 and the player
    // structure), which is what makes the station filter's effect visible —
    // Trade Hub mode alone already hides the player-structure order.
    await user.click(screen.getByRole('button', { name: 'Region' }));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('2,000,000.00')).toBeInTheDocument();
    const [, sellRow] = within(sellTable).getAllByRole('row');
    sellRow.focus();
    fireEvent.contextMenu(sellRow);

    await user.click(await screen.findByRole('menuitem', { name: 'Filter to this station' }));

    expect(
      await screen.findByText(/Filtered to Jita IV - Moon 4 - Caldari Navy Assembly Plant/)
    ).toBeInTheDocument();
    // The other sell order sits at a different (player-structure) location, so it drops out of view.
    expect(
      within(await screen.findByRole('table', { name: 'Sell Orders' })).queryByText('2,000,000.00')
    ).not.toBeInTheDocument();
    // The buy order shares the filtered-to station, so it stays visible.
    expect(
      within(await screen.findByRole('table', { name: 'Buy Orders' })).getByText('500,000.00')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(
      within(await screen.findByRole('table', { name: 'Sell Orders' })).getByText('2,000,000.00')
    ).toBeInTheDocument();
  });
});

describe('Location Mode and the Global Market Region (issue #3)', () => {
  it("Trade Hub mode filters the order book down to the hub's own station", async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('1,000,000.00')).toBeInTheDocument();
    expect(within(sellTable).queryByText('2,000,000.00')).not.toBeInTheDocument();
  });

  it('Region mode shows every station in the region, including ones Trade Hub mode hides', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });

    await user.click(screen.getByRole('button', { name: 'Region' }));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('2,000,000.00')).toBeInTheDocument();
    expect(within(sellTable).getByText('Unknown Structure', { exact: false })).toBeInTheDocument();
    // Same region as Trade Hub mode was already fetched, so this is the cached result, not a refetch.
    expect(hits.count).toBe(1);
  });

  it('the Region select offers only Market Regions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Region' }));

    const regionSelect = await screen.findByRole('combobox', { name: 'Region' });
    expect(
      within(regionSelect)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['The Forge', 'Domain']);
  });

  it('a globally-traded item reads its Global Market Region regardless of Location Mode, with an explanatory note', async () => {
    const hits = { count: 0 };
    server.use(plexOrdersHandler(hits));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'plex');
    await user.click(await screen.findByText('PLEX'));

    expect(await screen.findByText(/GPMR-01/)).toBeInTheDocument();
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    // PLEX orders still carry ordinary station ids, so Trade Hub mode's Jita filter still applies.
    expect(within(sellTable).getByText('3,000,000.00')).toBeInTheDocument();
    expect(hits.count).toBe(1);
  });
});

describe('Shareable Market Browser URLs (issue #4)', () => {
  it('selecting an item and changing location updates the query string', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    expect(window.location.search).toBe('?type=587&hub=jita');

    await user.click(screen.getByRole('button', { name: 'Region' }));
    expect(window.location.search).toBe('?type=587&region=10000002');
  });

  it('opening a Market Browser URL with item and location parameters restores that exact view', async () => {
    server.use(ordersHandler({ count: 0 }));
    window.history.pushState({}, '', '/market?type=587&hub=jita');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter', level: 2 })).toBeInTheDocument();
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('1,000,000.00')).toBeInTheDocument();
  });

  it('an unknown item id in the URL degrades to the default view instead of erroring', async () => {
    window.history.pushState({}, '', '/market?type=999999');
    render(<App />);

    expect(await screen.findByText('Select an item')).toBeInTheDocument();
  });

  it('a malformed location parameter degrades to the default location', async () => {
    server.use(ordersHandler({ count: 0 }));
    window.history.pushState({}, '', '/market?type=587&region=not-a-number');
    render(<App />);

    // Falls back to the persisted default (Trade Hub mode, Jita) rather than erroring.
    expect(await screen.findByRole('heading', { name: 'Rifter', level: 2 })).toBeInTheDocument();
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).queryByText('2,000,000.00')).not.toBeInTheDocument();
  });

  it('does not touch the URL while the user is still typing a search', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Ships');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    await user.type(await screen.findByRole('searchbox'), 'rift');

    expect(pushSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
  });

  it('toggling the location mode keeps a URL-supplied hub rather than reverting to the persisted default', async () => {
    server.use(
      ordersHandler({ count: 0 }),
      http.get(`${ESI_BASE_URL}/markets/10000043/orders`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );
    window.history.pushState({}, '', '/market?type=587&hub=amarr');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Rifter', level: 2 });

    await user.click(screen.getByRole('button', { name: 'Region' }));
    expect(window.location.search).toBe('?type=587&region=10000043'); // Domain, Amarr's region

    await user.click(screen.getByRole('button', { name: 'Trade Hub' }));
    expect(window.location.search).toBe('?type=587&hub=amarr');
  });

  it('browser back and forward move through previous selections', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    expect(await screen.findByRole('heading', { name: 'Rifter', level: 2 })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'trit');
    await user.click(await screen.findByText('Tritanium'));
    expect(await screen.findByRole('heading', { name: 'Tritanium', level: 2 })).toBeInTheDocument();

    window.history.back();
    expect(await screen.findByRole('heading', { name: 'Rifter', level: 2 })).toBeInTheDocument();

    window.history.forward();
    expect(await screen.findByRole('heading', { name: 'Tritanium', level: 2 })).toBeInTheDocument();
  });
});

describe('Market Browser narrow-screen layout (issue #4)', () => {
  it('shows one column at a time, with a back control that returns to the finder', async () => {
    // jsdom's default `window.matchMedia` (vitest.setup.ts) never matches,
    // so this already runs as a narrow viewport.
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup();
    render(<App />);

    const searchBox = await screen.findByRole('searchbox');
    const finderPanel = searchBox.closest('section');
    const itemPanel = (await screen.findByText('Select an item')).closest('section');
    expect(finderPanel).not.toHaveClass('hidden');
    expect(itemPanel).toHaveClass('hidden');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    expect(finderPanel).toHaveClass('hidden');
    expect(itemPanel).not.toHaveClass('hidden');
    const backButton = await screen.findByRole('button', { name: 'Back' });

    await user.click(backButton);

    expect(finderPanel).not.toHaveClass('hidden');
    expect(itemPanel).toHaveClass('hidden');
    // The tree state (search text, matched item) survived being hidden rather than unmounted.
    expect(screen.getByRole('searchbox')).toHaveValue('rift');
    expect(screen.getByText('Rifter')).toBeInTheDocument();
  });

  it('keeps the desktop two-column layout unchanged, with no back control', async () => {
    server.use(ordersHandler({ count: 0 }));
    const original = window.matchMedia;
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: true,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;

    try {
      const user = userEvent.setup();
      render(<App />);

      const searchBox = await screen.findByRole('searchbox');
      const finderPanel = searchBox.closest('section');
      await user.type(searchBox, 'rift');
      await user.click(await screen.findByText('Rifter'));

      expect(finderPanel).not.toHaveClass('hidden');
      const itemPanel = screen
        .getByRole('heading', { name: 'Rifter', level: 2 })
        .closest('section');
      expect(itemPanel).not.toHaveClass('hidden');
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
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
