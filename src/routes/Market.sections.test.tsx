import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
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
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => ({})),
}));

// Market() unconditionally loads its own catalogue on mount regardless of
// which top-level tab is showing — these tests only exercise the
// character-scoped tabs, so an empty catalogue is enough to keep that effect
// from making real requests msw would otherwise reject as unhandled.
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => []),
  loadMarketTypes: vi.fn(async () => []),
  loadNpcStations: vi.fn(async () => []),
  loadSolarSystems: vi.fn(async () => []),
  loadMarketRegions: vi.fn(async () => []),
  loadGlobalMarkets: vi.fn(async () => []),
  loadVariations: vi.fn(async () => ({ types: {}, metaGroups: {} })),
}));

const CHAR_ID = 91;

const openOrder = {
  order_id: 1,
  type_id: 34,
  region_id: 10000002,
  location_id: 60003760,
  is_buy_order: false,
  is_corporation: false,
  price: 5.5,
  volume_remain: 100,
  volume_total: 200,
  issued: '2026-08-01T00:00:00Z',
  duration: 90,
  range: 'region',
};

const historyOrder = { ...openOrder, order_id: 2, state: 'expired' as const };

const transactions = [
  {
    transaction_id: 1,
    date: '2026-08-01T00:00:00Z',
    location_id: 60003760,
    type_id: 34,
    unit_price: 5,
    quantity: 100,
    client_id: 1,
    is_buy: false,
    is_personal: true,
    journal_ref_id: 1,
  },
  {
    transaction_id: 2,
    date: '2026-08-01T00:00:01Z',
    location_id: 60003760,
    type_id: 35,
    unit_price: 12,
    quantity: 10,
    client_id: 2,
    is_buy: true,
    is_personal: true,
    journal_ref_id: 2,
  },
];

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
    HttpResponse.json([openOrder])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
    HttpResponse.json([historyOrder])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, ({ request }) => {
    const fromId = new URL(request.url).searchParams.get('from_id');
    return HttpResponse.json(fromId === null ? transactions : []);
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
    scopes: ['esi-markets.read_character_orders.v1', 'esi-wallet.read_character_wallet.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
});

describe('Market top-level tabs', () => {
  it('lands on the Market Browser tab by default, with no Orders nav link anywhere', async () => {
    window.history.pushState({}, '', '/market');
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Market' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
  });

  it('switches to Open Orders, History and Transactions via the tab bar', async () => {
    window.history.pushState({}, '', '/market');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Market' });

    await user.click(screen.getByRole('tab', { name: 'Open' }));
    // The fixture order has no problems, so it lands in the Healthy group,
    // which starts folded — reveal it to see the row.
    await user.click(await screen.findByRole('button', { name: 'Show healthy orders' }));
    expect(
      within(screen.getByRole('table', { name: 'Healthy · 1' })).getByText('Tritanium')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sell' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('expired')).toBeInTheDocument();

    // The second view is picked from the table's own header, not a nested tab.
    await user.click(screen.getByRole('combobox', { name: 'History view' }));
    await user.click(await screen.findByRole('option', { name: 'Transactions' }));
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
  });

  it('switching to Open Orders keeps that tab selected even with a lingering ?type= param from Browser', async () => {
    // A prior item selection on the Browser tab leaves `type` in the URL;
    // switching tabs must not be undone by the cross-link sync effect below.
    // Mocked because a fresh mount briefly treats an unloaded catalogue as
    // "not yet known invalid" (`resolveAgainstCatalogue`), so Browser's order
    // book can fetch once before this suite's empty catalogue mocks resolve.
    server.use(
      http.get('https://esi.evetech.net/markets/:regionId/orders', () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );
    window.history.pushState({}, '', '/market?type=34');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Market' });

    await user.click(screen.getByRole('tab', { name: 'Open' }));
    // The fixture order is healthy, so it's folded until revealed.
    await user.click(await screen.findByRole('button', { name: 'Show healthy orders' }));

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a linked item name from Open Orders lands on the Market Browser tab', async () => {
    window.history.pushState({}, '', '/market?section=orders');
    const user = userEvent.setup();
    render(<App />);

    // The fixture order is healthy, so it's folded until revealed.
    await user.click(await screen.findByRole('button', { name: 'Show healthy orders' }));
    const itemLink = await screen.findByRole('link', { name: 'Tritanium' });
    await user.click(itemLink);

    expect(await screen.findByRole('tab', { name: 'Market' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'false');
  });

  it('opens the Transactions view from a deep link, with History still the selected tab', async () => {
    window.history.pushState({}, '', '/market?section=transactions');
    const user = userEvent.setup();
    render(<App />);

    // Both views are the character's past, so the tab stays History and the
    // header's select says which of the two is showing.
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: 'History view' })).toHaveTextContent(
      'Transactions'
    );
    expect(
      screen.getByRole('button', { name: 'About Orders and Transactions' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'History view' }));
    await user.click(await screen.findByRole('option', { name: 'Orders' }));
    expect(await screen.findByText('expired')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'History view' })).toHaveTextContent('Orders');
  });
});

describe('Market Open Orders tab', () => {
  it('shows open orders directly via a ?section= deep link, with resolved item name', async () => {
    window.history.pushState({}, '', '/market?section=orders');
    const user = userEvent.setup();
    render(<App />);
    // The fixture order has no problems, so it lands in the Healthy group,
    // which starts folded — reveal it to see the resolved item name.
    await user.click(await screen.findByRole('button', { name: 'Show healthy orders' }));
    expect(
      within(screen.getByRole('table', { name: 'Healthy · 1' })).getByText('Tritanium')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sell' })).toBeInTheDocument();
  });

  it('falls back to cached orders offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'orders',
      value: [openOrder],
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () => HttpResponse.error())
    );
    window.history.pushState({}, '', '/market?section=orders');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Show healthy orders' }));
    expect(
      within(screen.getByRole('table', { name: 'Healthy · 1' })).getByText('Tritanium')
    ).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () => HttpResponse.error())
    );
    window.history.pushState({}, '', '/market?section=orders');
    render(<App />);
    expect(await screen.findByText(/no open orders cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the orders scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    window.history.pushState({}, '', '/market?section=orders');
    render(<App />);
    // The banner is now per character, since this page covers every selling
    // character at once — title is prefixed with the character's name.
    expect(
      await screen.findByText('Pilot One — Log in again to see your orders')
    ).toBeInTheDocument();
    // NB: this currently fails — OpenOrdersPanel.tsx renders the reauth
    // banner and the "no open orders cached" EmptyState unconditionally
    // side by side (the old code was an if/else: reauth XOR empty/table).
    // See the report for the fix this needs; not something this test file
    // can paper over.
    expect(screen.queryByText(/no open orders cached/i)).not.toBeInTheDocument();
  });
});

describe('Market History tab', () => {
  it('shows order history directly via a ?section= deep link', async () => {
    window.history.pushState({}, '', '/market?section=history');
    render(<App />);
    expect(await screen.findByText('expired')).toBeInTheDocument();
  });

  it('falls back to cached history offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'orders:history',
      value: [historyOrder],
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
        HttpResponse.error()
      )
    );
    window.history.pushState({}, '', '/market?section=history');
    render(<App />);
    expect(await screen.findByText('expired')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt when the orders scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    window.history.pushState({}, '', '/market?section=history');
    render(<App />);
    expect(await screen.findByText('Log in again to see your orders')).toBeInTheDocument();
    expect(screen.queryByText(/no order history cached/i)).not.toBeInTheDocument();
  });
});

describe('Market Transactions tab', () => {
  it('shows transactions with SDE item names resolved, directly via a ?section= deep link', async () => {
    window.history.pushState({}, '', '/market?section=transactions');
    render(<App />);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
  });

  it('signs and colors transaction totals: buy negative red, sell positive green', async () => {
    window.history.pushState({}, '', '/market?section=transactions');
    render(<App />);

    const sellTotal = await screen.findByText('500.00');
    expect(sellTotal.className).toContain('text-isk-pos');

    const buyTotal = await screen.findByText('-120.00');
    expect(buyTotal.className).toContain('text-isk-neg');
  });

  it('stops paging at the cap, and says nothing about it (D4)', async () => {
    let calls = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () => {
        calls += 1;
        return HttpResponse.json([{ ...transactions[0], transaction_id: 1000 - calls }]);
      })
    );
    window.history.pushState({}, '', '/market?section=transactions');
    render(<App />);

    // Five identical Tritanium fills come back, one per page.
    expect((await screen.findAllByText('Tritanium')).length).toBeGreaterThan(1);
    expect(calls).toBe(5);
    // The cap is how far back this view goes, not a fault to warn about.
    expect(screen.queryByText(/recent transactions only/i)).not.toBeInTheDocument();
  });

  it('distinguishes a failed manual Refresh from the initial-load offline banner (UX-REVIEW #10)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:transactions',
      value: transactions,
      fetchedAt: STALE_FETCHED_AT,
    });
    window.history.pushState({}, '', '/market?section=transactions');
    const user = userEvent.setup();
    render(<App />);

    // Initial load succeeds live — no banner at all yet.
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText(/showing cached data/i)).not.toBeInTheDocument();

    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () =>
        HttpResponse.error()
      )
    );
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Refresh failed — showing cached data')).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () =>
        HttpResponse.error()
      )
    );
    window.history.pushState({}, '', '/market?section=transactions');
    render(<App />);
    expect(await screen.findByText(/no transactions cached/i)).toBeInTheDocument();
  });
});
