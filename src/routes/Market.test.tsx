import { describe, it, expect, vi } from 'vitest';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { loadGlobalMarkets, loadMarketTypes, loadNpcStations } from '@/sde/loadMarketSde';
import { ESI_BASE_URL } from '@/esi/client';
import { App } from '@/app/App';
import { RECENT_DATE, TYPES } from '@/test/marketMocks';
import {
  RIFTER_REGION_ID,
  SHIPS_GROUP,
  historyHandler,
  installMarketHarness,
  ordersHandler,
  plexOrdersHandler,
  server,
} from '@/test/marketPage';

vi.mock('@/sde/loadSde', async () => (await import('@/test/marketMocks')).loadSdeMock());
vi.mock('@/sde/loadTypeInfo', async () => (await import('@/test/marketMocks')).loadTypeInfoMock());
vi.mock('@/features/market/PriceHistoryChart', async () =>
  (await import('@/test/marketMocks')).priceHistoryChartMock()
);
vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/marketMocks')).pwaRegisterMock()
);
vi.mock('@/sde/loadMarketSde', async () =>
  (await import('@/test/marketMocks')).loadMarketSdeMock()
);

installMarketHarness();

describe('Market Browser', () => {
  it('filters the Market Group tree in place, hiding branches with no match', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    expect(await screen.findByRole('button', SHIPS_GROUP)).toBeInTheDocument();
    expect(screen.getByText('Ore')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'rift');

    expect(await screen.findByText('Rifter')).toBeInTheDocument();
    expect(screen.getByRole('button', SHIPS_GROUP)).toBeInTheDocument();
    expect(screen.queryByText('Ore')).not.toBeInTheDocument();
  });

  it('pins an exact-name match under a "Best match" heading above the tree (issue #1742)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rifter');

    expect(await screen.findByText('Best match')).toBeInTheDocument();
    expect(screen.getAllByText('Rifter')).toHaveLength(1);
  });

  it('tells assistive tech whether a Market Group is expanded', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    const ships = await screen.findByRole('button', SHIPS_GROUP);
    expect(ships).toHaveAttribute('aria-expanded', 'false');
    await user.click(ships);
    expect(ships).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a "type more" hint below the search threshold instead of silently showing the full tree (issue #412)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await screen.findByRole('button', SHIPS_GROUP);
    await user.type(screen.getByRole('searchbox'), 'ri');

    expect(screen.getAllByText('Type 3+ characters to search.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', SHIPS_GROUP)).toBeInTheDocument();
    expect(screen.getByText('Ore')).toBeInTheDocument(); // full, unfiltered tree — still explicit about why

    await user.type(screen.getByRole('searchbox'), 'ft');
    expect(await screen.findByText('Rifter')).toBeInTheDocument();
    expect(screen.queryByText('Type 3+ characters to search.')).not.toBeInTheDocument();
  });

  // The shell mounts its own (empty) notice regions too, so read them all.
  const statusTexts = () => screen.getAllByRole('status').map((node) => node.textContent);

  it('announces the match count, and a miss, through a status region (issue #3354)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await screen.findByRole('button', SHIPS_GROUP);
    await user.type(screen.getByRole('searchbox'), 'rifter');
    await waitFor(() => expect(statusTexts()).toContain('1 item matches'));

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzzzqqq');
    await waitFor(() => expect(statusTexts()).toContain('No items match your search.'));
  });

  it('lets a matched group be collapsed and re-expanded while a search is active', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    expect(await screen.findByText('Rifter')).toBeInTheDocument();

    // Collapsing "Ships" only hides its own contents — it must not touch the
    // search filter, so it stays a no-op on which items matched.
    await user.click(screen.getByRole('button', SHIPS_GROUP));
    expect(screen.queryByText('Rifter')).not.toBeInTheDocument();
    expect(screen.getByRole('button', SHIPS_GROUP)).toBeInTheDocument();

    await user.click(screen.getByRole('button', SHIPS_GROUP));
    expect(await screen.findByText('Rifter')).toBeInTheDocument();
  });

  describe('search category headers (issue #3136)', () => {
    const zephyrs = (count: number, marketGroupId: number): MarketTypeEntry[] =>
      Array.from({ length: count }, (_, i) => ({
        typeId: 90000 + marketGroupId * 100 + i,
        name: `Zephyr ${marketGroupId}-${i}`,
        marketGroupId,
        volume: 1,
      }));

    it('starts a lone matching category expanded, with its count in the header name', async () => {
      const user = userEvent.setup({ delay: null });
      render(<App />);
      await user.type(await screen.findByRole('searchbox'), 'rift');

      const ships = await screen.findByRole('button', { name: 'Ships · 1' });
      expect(ships).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Rifter')).toBeInTheDocument();
    });

    it('opens every category when the matches fit in a dozen rows', async () => {
      vi.mocked(loadMarketTypes).mockResolvedValueOnce([
        ...TYPES,
        ...zephyrs(2, 2),
        ...zephyrs(3, 3),
      ]);
      const user = userEvent.setup({ delay: null });
      render(<App />);
      await user.type(await screen.findByRole('searchbox'), 'zephyr');

      expect(await screen.findByRole('button', { name: 'Ships · 2' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Ore · 3' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      expect(screen.getByText('Zephyr 3-2')).toBeInTheDocument();
    });

    it('starts broad searches collapsed, expands one on click, and resets when the text changes', async () => {
      vi.mocked(loadMarketTypes).mockResolvedValueOnce([
        ...TYPES,
        ...zephyrs(8, 2),
        ...zephyrs(8, 3),
      ]);
      const user = userEvent.setup({ delay: null });
      render(<App />);
      const box = await screen.findByRole('searchbox');
      await user.type(box, 'zephyr');

      const ships = await screen.findByRole('button', { name: 'Ships · 8' });
      const ore = screen.getByRole('button', { name: 'Ore · 8' });
      expect(ships).toHaveAttribute('aria-expanded', 'false');
      expect(ore).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Zephyr 3-0')).not.toBeInTheDocument();

      await user.click(ore);
      expect(await screen.findByText('Zephyr 3-0')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ore · 8' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );

      // Typing on is a new search: the flip is forgotten and Ore folds again.
      await user.clear(box);
      await user.type(box, 'phyr');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Ore · 8' })).toHaveAttribute(
          'aria-expanded',
          'false'
        )
      );
    });
  });

  it('a ?group= link lands the tree expanded down to that category (issue #407)', async () => {
    window.history.pushState({}, '', '/market?group=4');
    render(<App />);

    // Group 4 ("Destroyers") sits under group 1 ("Ships") — both must expand
    // for its items to show, with no click needed.
    expect(await screen.findByText('Merlin')).toBeInTheDocument();
    expect(screen.getByRole('button', SHIPS_GROUP)).toBeInTheDocument();
    expect(screen.getByText('Destroyers')).toBeInTheDocument();
  });

  it('ignores a ?group= id that is not in the loaded catalogue', async () => {
    window.history.pushState({}, '', '/market?group=999');
    render(<App />);

    expect(await screen.findByRole('button', SHIPS_GROUP)).toBeInTheDocument();
    expect(screen.queryByText('Merlin')).not.toBeInTheDocument();
  });

  it('prompts to search or browse when nothing is selected', async () => {
    render(<App />);
    expect(await screen.findByText('Select an item')).toBeInTheDocument();
  });

  it('selecting an item loads its order book: separate sell/buy tables, sorted', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('1,000,000')).toBeInTheDocument();
    // The hub is one station, which the scope bar names: rows don't repeat it.
    expect(
      within(sellTable).queryByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant', {
        exact: false,
      })
    ).not.toBeInTheDocument();
    expect(within(sellTable).queryByRole('columnheader', { name: /Location/ })).toBeNull();

    const buyTable = await screen.findByRole('table', { name: 'Buy Orders' });
    expect(within(buyTable).getByText('500,000')).toBeInTheDocument();
  });

  it('focuses the item panel heading on selection, and the tree row on Back (issue #1485)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    const treeRow = (await screen.findByText('Rifter')).closest('button');
    expect(treeRow).not.toBeNull();
    await user.click(treeRow as HTMLButtonElement);

    const heading = await screen.findByRole('heading', { name: 'Rifter' });
    expect(heading).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(treeRow).toHaveFocus());
  });

  it('an ESI failure shows a failed state, not an empty book and not a spinner', async () => {
    // `getOrderBook` throws on any ESI failure. The fetch effect once let
    // that reject into nothing and spun forever; the fix after that read the
    // failure as an empty book, telling the pilot nobody trades the item when
    // the truth is the request never came back.
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${RIFTER_REGION_ID}/orders`, () =>
        HttpResponse.json({ error: 'Rate limit exceeded' }, { status: 420 })
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    expect(await screen.findByText("Couldn't load the order book")).toBeInTheDocument();
    expect(screen.queryByText('No sell orders')).not.toBeInTheDocument();
    expect(screen.queryByText('No buy orders')).not.toBeInTheDocument();
  });

  it('a deep-linked item still loads its order book when the market catalogue fails', async () => {
    // The book waits only on globalMarkets.json, never on the whole catalogue:
    // a failed stations.json once left a selected item spinning forever.
    vi.mocked(loadNpcStations).mockRejectedValueOnce(new Error('network error'));
    server.use(ordersHandler({ count: 0 }));
    window.history.pushState({}, '', '/market?type=587');

    render(<App />);

    expect(await screen.findByRole('table', { name: 'Sell Orders' })).toBeInTheDocument();
  });

  it('Refresh retries a failed catalogue load instead of staying disabled', async () => {
    vi.mocked(loadNpcStations).mockRejectedValueOnce(new Error('network error'));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    expect(await screen.findByText("Couldn't load the market catalogue")).toBeInTheDocument();
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toBeEnabled();

    await user.click(refresh);

    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the market catalogue")).not.toBeInTheDocument();
  });

  it('says the catalogue needs a one-time download, not "Press Refresh", when offline, and reloads on reconnect', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      vi.mocked(loadNpcStations).mockRejectedValueOnce(new Error('network error'));
      render(<App />);

      expect(await screen.findByText("Couldn't load the market catalogue")).toBeInTheDocument();
      expect(screen.getByText(/needs a one-time download/)).toBeInTheDocument();
      expect(screen.queryByText('Press Refresh to try again.')).not.toBeInTheDocument();

      Reflect.deleteProperty(navigator, 'onLine');
      window.dispatchEvent(new Event('online'));

      expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, 'onLine');
    }
  });

  it('a failed globalMarkets.json load reads the chosen region instead of hanging', async () => {
    vi.mocked(loadGlobalMarkets).mockRejectedValueOnce(new Error('network error'));
    server.use(ordersHandler({ count: 0 }));
    window.history.pushState({}, '', '/market?type=587');

    render(<App />);

    expect(await screen.findByRole('table', { name: 'Sell Orders' })).toBeInTheDocument();
  });

  it('Try again after a failed order book refetches and shows the rows', async () => {
    let fail = true;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${RIFTER_REGION_ID}/orders`, () =>
        fail
          ? HttpResponse.json({ error: 'Internal error' }, { status: 500 })
          : HttpResponse.json(
              [
                {
                  order_id: 1,
                  type_id: 587,
                  is_buy_order: false,
                  price: 450_000,
                  location_id: 60003760,
                  system_id: 30000142,
                  volume_remain: 3,
                  volume_total: 3,
                  min_volume: 1,
                  duration: 90,
                  issued: '2026-08-01T00:00:00Z',
                  range: 'region',
                },
              ],
              { headers: { 'X-Pages': '1' } }
            )
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByText("Couldn't load the order book");

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('450,000')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the order book")).not.toBeInTheDocument();
  });

  it('Refresh bypasses the 300s order-book cache and refetches immediately', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });
    expect(hits.count).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(hits.count).toBe(2));
  });
});

describe('Price History tab (issue #11)', () => {
  it('defaults to Order Book; opening Price History fetches and shows the chart', async () => {
    const historyHits = { count: 0 };
    server.use(
      ordersHandler({ count: 0 }),
      historyHandler(historyHits, RIFTER_REGION_ID, {
        587: [
          {
            date: RECENT_DATE,
            average: 5,
            highest: 5.5,
            lowest: 4.5,
            order_count: 2,
            volume: 100,
          },
        ],
      })
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });
    expect(screen.getByRole('tab', { name: 'Order Book', selected: true })).toBeInTheDocument();
    expect(historyHits.count).toBe(0); // not fetched until the tab is opened

    await user.click(screen.getByRole('tab', { name: 'Price History' }));

    expect(await screen.findByTestId('price-history-chart')).toHaveTextContent('Rifter: 1 points');
    expect(historyHits.count).toBe(1);
  });

  it('keeps Price History selected and refetches when a different item is chosen', async () => {
    const historyHits = { count: 0 };
    server.use(
      ordersHandler({ count: 0 }),
      // Tritanium's Variations table falls back to PLEX (same market group,
      // fixtures above), whose order book lives at its own Global Market
      // Region rather than Tritanium's.
      plexOrdersHandler({ count: 0 }),
      historyHandler(historyHits, RIFTER_REGION_ID, {
        587: [
          {
            date: RECENT_DATE,
            average: 5,
            highest: 5.5,
            lowest: 4.5,
            order_count: 2,
            volume: 100,
          },
        ],
        34: [
          {
            date: RECENT_DATE,
            average: 6,
            highest: 6.5,
            lowest: 5.5,
            order_count: 3,
            volume: 200,
          },
        ],
      })
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await user.click(screen.getByRole('tab', { name: 'Price History' }));
    await screen.findByTestId('price-history-chart');

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'trit');
    await user.click(await screen.findByText('Tritanium'));

    expect(screen.getByRole('tab', { name: 'Price History', selected: true })).toBeInTheDocument();
    expect(await screen.findByTestId('price-history-chart')).toHaveTextContent(
      'Tritanium: 1 points'
    );
    expect(historyHits.count).toBe(2);
  });

  it('shows an empty state, not a blank chart, when ESI has no history for the item', async () => {
    server.use(
      ordersHandler({ count: 0 }),
      historyHandler({ count: 0 }, RIFTER_REGION_ID, { 587: [] })
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await user.click(screen.getByRole('tab', { name: 'Price History' }));

    expect(await screen.findByText('No price history')).toBeInTheDocument();
    expect(screen.queryByTestId('price-history-chart')).not.toBeInTheDocument();
  });

  it('reads compared regions from the URL and fetches each one, so a shared link compares the same regions', async () => {
    const forgeHits = { count: 0 };
    const domainHits = { count: 0 };
    const day = [
      { date: RECENT_DATE, average: 5, highest: 5.5, lowest: 4.5, order_count: 2, volume: 100 },
    ];
    server.use(
      ordersHandler({ count: 0 }),
      historyHandler(forgeHits, RIFTER_REGION_ID, { 587: day }),
      historyHandler(domainHits, 10000043, { 587: day })
    );
    window.history.pushState(
      {},
      '',
      '/market?type=587&browser.itemTab=history&browser.compare=10000043'
    );
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('price-history-chart')).toHaveTextContent(
        'Rifter: 1 points [Domain:ready]'
      )
    );
    expect(forgeHits.count).toBe(1);
    expect(domainHits.count).toBe(1);
    expect(
      screen.getByRole('button', { name: 'Compare regions, 1 of 4 picked' })
    ).toBeInTheDocument();
  });
});
