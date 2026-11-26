import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import * as routeChunks from '@/app/routeChunks';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { marketTypesHandler, renderMarketRoute } from '@/test/marketPage';
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
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [], infrastructure: {} })),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(async () => ({})),
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
  issued: new Date(Date.now() - 86_400_000).toISOString(),
  duration: 90,
  range: 'region',
};

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
  marketTypesHandler([34, 35]),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
    HttpResponse.json([openOrder])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
    HttpResponse.json([])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, ({ request }) => {
    const fromId = new URL(request.url).searchParams.get('from_id');
    return HttpResponse.json(fromId === null ? transactions : []);
  }),
  http.get('https://market.fuzzwork.co.uk/aggregates/', () => HttpResponse.json({})),
  http.get('https://esi.evetech.net/markets/:regionId/orders', () => HttpResponse.json([]))
);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await routeChunks.loadMarket();
  await Promise.all([import('@/app/App'), routeChunks.loadLayout()]);
}, 30_000);
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.walletTransactionArchive.clear();
  await db.walletJournalArchive.clear();
  await db.walletArchiveCoverage.clear();
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
  it('lands on the Market Browser tab by default inside the shell, with no Orders nav link anywhere', async () => {
    window.history.pushState({}, '', '/market');
    const { App } = await import('@/app/App');
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Market' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const rail = (await screen.findAllByRole('navigation'))[0];
    const marketLinks = await within(rail).findAllByRole('link', { name: 'Market' });
    expect(marketLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Hauling' })).toBeInTheDocument();
  });

  it('opens Hauling from its URL and leaves its query behind on the way out', async () => {
    window.history.pushState({}, '', '/market/hauling?from=amarr&to=jita');
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    expect(await screen.findByRole('tab', { name: 'Hauling' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.click(screen.getByRole('tab', { name: 'Market' }));
    expect(window.location.pathname).toBe('/market/browser');
    expect(window.location.search).toBe('');
  });

  it('switches to Open Orders and History via the tab bar', async () => {
    window.history.pushState({}, '', '/market');
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await screen.findByRole('tab', { name: 'Market' });

    await user.click(screen.getByRole('tab', { name: 'Open' }));
    await user.click(await screen.findByRole('button', { name: 'Show' }));
    expect(
      within(screen.getByRole('table', { name: 'All orders' })).getByText('Tritanium')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('button', { name: 'Sell' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
  });

  it('switching to Open Orders keeps that tab selected even with a lingering ?type= param from Browser', async () => {
    server.use(
      http.get('https://esi.evetech.net/markets/:regionId/orders', () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );
    window.history.pushState({}, '', '/market?type=34');
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await screen.findByRole('tab', { name: 'Market' });

    await user.click(screen.getByRole('tab', { name: 'Open' }));
    await user.click(await screen.findByRole('button', { name: 'Show' }));

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');
  });

  it('an Open Orders item name opens the order details, whose Market link lands on the Market Browser tab', async () => {
    window.history.pushState({}, '', '/market/orders');
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    await user.click(await screen.findByRole('button', { name: 'Show' }));
    expect(screen.queryByRole('link', { name: 'Tritanium' })).not.toBeInTheDocument();
    await user.click(await screen.findByText('Tritanium'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('link', { name: 'View in Market' }));

    expect(await screen.findByRole('tab', { name: 'Market' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'false');
  });

  it('moves an old /market/history/transactions link to History, keeping its query', async () => {
    window.history.pushState({}, '', '/market/history/transactions?highlight=34');
    renderMarketRoute();

    await waitFor(() => expect(window.location.pathname).toBe('/market/history'));
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('row', { name: /Tritanium/ })).toHaveClass('row-pulse')
    );
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('combobox', { name: 'History view' })).not.toBeInTheDocument();
  });
});

describe('Market Open Orders tab', () => {
  it('shows open orders directly via a /market/orders deep link, with resolved item name', async () => {
    window.history.pushState({}, '', '/market/orders');
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await user.click(await screen.findByRole('button', { name: 'Show' }));
    expect(
      within(screen.getByRole('table', { name: 'All orders' })).getByText('Tritanium')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
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
    window.history.pushState({}, '', '/market/orders');
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await user.click(await screen.findByRole('button', { name: 'Show' }));
    expect(
      within(screen.getByRole('table', { name: 'All orders' })).getByText('Tritanium')
    ).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () => HttpResponse.error())
    );
    window.history.pushState({}, '', '/market/orders');
    renderMarketRoute();
    expect(await screen.findByText(/^no open orders$/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the orders scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    window.history.pushState({}, '', '/market/orders');
    renderMarketRoute();
    expect(await screen.findByText('Pilot One: log in again')).toBeInTheDocument();
    expect(screen.queryByText(/^no open orders$/i)).not.toBeInTheDocument();
  });
});

describe('Market History tab (Transactions)', () => {
  it('shows transactions with SDE item names resolved, directly via a /market/history deep link', async () => {
    window.history.pushState({}, '', '/market/history');
    renderMarketRoute();
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
  });

  it('scrolls to and pulses the item a filled-sell-order alert pointed at', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    window.history.pushState({}, '', '/market/history?highlight=34');
    renderMarketRoute();

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('[data-row-key="1"]')?.className).toContain('row-pulse');
    });
    expect(document.querySelector('[data-row-key="2"]')?.className).not.toContain('row-pulse');
    await waitFor(() => {
      expect(scrollIntoView.mock.instances).toContain(document.querySelector('[data-row-key="1"]'));
    });

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has('highlight')).toBe(false);
    });
    scrollIntoView.mockRestore();
  });

  it('pulses nothing when the item has no sell of its own to point at', async () => {
    window.history.pushState({}, '', '/market/history?highlight=35');
    renderMarketRoute();

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(document.querySelector('.row-pulse')).toBeNull();
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has('highlight')).toBe(false);
    });
  });

  it('signs and colors transaction totals: buy negative red, sell positive green', async () => {
    window.history.pushState({}, '', '/market/history');
    renderMarketRoute();

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
    window.history.pushState({}, '', '/market/history');
    renderMarketRoute();

    expect((await screen.findAllByText('Tritanium')).length).toBeGreaterThan(1);
    expect(calls).toBe(5);
    expect(screen.queryByText(/recent transactions only/i)).not.toBeInTheDocument();
  });

  it('distinguishes a failed manual Refresh from the initial-load offline banner (UX-REVIEW #10)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:transactions',
      value: transactions,
      fetchedAt: STALE_FETCHED_AT,
    });
    window.history.pushState({}, '', '/market/history');
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

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
    window.history.pushState({}, '', '/market/history');
    renderMarketRoute();
    expect(await screen.findByText(/no transactions loaded/i)).toBeInTheDocument();
  });
});
