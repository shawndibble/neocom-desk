import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { useMarketHub } from '@/features/market/hub';
import { useMarketBrowserHub } from '@/features/market/browserHub';
import { LOCATION_MODE_SETTING_KEY } from '@/features/market/locationMode';
import { useBrowserFilterSetting } from '@/features/market/browserFilterSetting';
import { ESI_BASE_URL } from '@/esi/client';
import { App } from '@/app/App';
import {
  RIFTER_REGION_ID,
  SHIPS_GROUP,
  finder,
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

describe('Location Mode and the Global Market Region (issue #3)', () => {
  it("Trade Hub mode filters the order book down to the hub's own station", async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('1,000,000')).toBeInTheDocument();
    expect(within(sellTable).queryByText('2,000,000')).not.toBeInTheDocument();
  });

  it('shows Distance and Min quantity in both modes; Security and NPC-only only once the book spans stations', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });
    // Behind the funnel, like the other search pages.
    expect(screen.queryByRole('spinbutton', { name: 'Min quantity' })).not.toBeInTheDocument();
    await user.click(within(finder()).getByRole('button', { name: 'Filters' }));
    expect(within(finder()).getByRole('spinbutton', { name: 'Min quantity' })).toBeInTheDocument();
    expect(within(finder()).getByRole('combobox', { name: 'Distance' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Security' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'NPC stations only' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Region' }));

    expect(await within(finder()).findByRole('combobox', { name: 'Distance' })).toBeInTheDocument();
    expect(within(finder()).getByRole('group', { name: 'Security' })).toBeInTheDocument();
    expect(within(finder()).getByRole('button', { name: 'NPC stations only' })).toBeInTheDocument();
  });

  it('Min quantity and NPC stations only narrow the book, counted on the funnel', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    window.history.pushState({}, '', '/market/browser?type=587&region=10000002');
    render(<App />);

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('2,000,000')).toBeInTheDocument();

    await user.click(within(finder()).getByRole('button', { name: 'Filters' }));
    await user.click(within(finder()).getByRole('button', { name: 'NPC stations only' }));

    // The player-structure sell order drops out; the Jita 4-4 one stays.
    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: 'Sell Orders' })).queryByText('2,000,000')
      ).not.toBeInTheDocument()
    );
    expect(
      within(finder()).getByRole('button', { name: 'Filters (1 active)' })
    ).toBeInTheDocument();

    await user.type(within(finder()).getByRole('spinbutton', { name: 'Min quantity' }), '6');
    // Jita's orders have 5 (sell) and 3 (buy) left, so both sides empty — and the hint says why.
    expect(
      await screen.findAllByText('No orders match the filters. Loosen them to see more.')
    ).toHaveLength(2);
    expect(
      within(finder()).getByRole('button', { name: 'Filters (2 active)' })
    ).toBeInTheDocument();
  });

  it('Hide bait sells drops the flagged sell, says how many it hid, and remembers the choice', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${RIFTER_REGION_ID}/orders`, () =>
        HttpResponse.json(
          [1_000_000, 50_000_000].map((price, i) => ({
            order_id: 100 + i,
            type_id: 587,
            is_buy_order: false,
            price,
            location_id: 60003760,
            system_id: 30000142,
            volume_remain: 1,
            volume_total: 1,
            min_volume: 1,
            duration: 90,
            issued: '2026-08-01T00:00:00Z',
            range: 'region',
          })),
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup({ delay: null });
    window.history.pushState({}, '', '/market/browser?type=587&region=10000002');
    render(<App />);

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    // Off by default: the bait row shows, flagged.
    expect(within(sellTable).getByText('50,000,000')).toBeInTheDocument();
    expect(screen.queryByText(/bait sells? hidden/)).not.toBeInTheDocument();

    await user.click(within(finder()).getByRole('button', { name: 'Filters' }));
    await user.click(within(finder()).getByRole('button', { name: 'Hide bait sells' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: 'Sell Orders' })).queryByText('50,000,000')
      ).not.toBeInTheDocument()
    );
    expect(
      within(screen.getByRole('table', { name: 'Sell Orders' })).getByText('1,000,000')
    ).toBeInTheDocument();
    expect(screen.getByText('1 bait sell hidden')).toBeInTheDocument();
    expect(
      within(finder()).getByRole('button', { name: 'Filters (1 active)' })
    ).toBeInTheDocument();
    await waitFor(() => expect(useBrowserFilterSetting.getState().value.hideBait).toBe(true));

    await user.click(within(finder()).getByRole('button', { name: 'Hide bait sells' }));
    expect(
      await within(screen.getByRole('table', { name: 'Sell Orders' })).findByText('50,000,000')
    ).toBeInTheDocument();
    expect(screen.queryByText(/bait sells? hidden/)).not.toBeInTheDocument();
  });

  it('Region mode shows every station in the region, including ones Trade Hub mode hides', async () => {
    const hits = { count: 0 };
    server.use(ordersHandler(hits));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });

    await user.click(screen.getByRole('button', { name: 'Region' }));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('2,000,000')).toBeInTheDocument();
    expect(within(sellTable).getByText('Unknown Structure', { exact: false })).toBeInTheDocument();
    // Same region as Trade Hub mode was already fetched, so this is the cached result, not a refetch.
    expect(hits.count).toBe(1);
  });

  it('the Region select offers All regions plus only Market Regions', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Region' }));

    await user.click(await screen.findByRole('combobox', { name: 'Region' }));
    expect(
      // The selected option renders a leading, aria-hidden "✓" indicator
      // alongside the label — stripped here since `textContent` includes it
      // even though it's invisible to the accessibility tree. Alphabetical:
      // `RegionSelect` sorts by name.
      (await screen.findAllByRole('option')).map((o) => o.textContent?.replace(/^✓/, ''))
    ).toEqual(['All regions', 'Domain', 'The Forge']);
  });

  it('a globally-traded item reads its Global Market Region regardless of Location Mode, with an explanatory note', async () => {
    const hits = { count: 0 };
    server.use(
      plexOrdersHandler(hits),
      // PLEX's Variations table falls back to Tritanium (same market group,
      // fixtures in @/test/marketMocks), whose order book lives at the Forge region rather
      // than PLEX's Global Market Region.
      ordersHandler({ count: 0 })
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'plex');
    await user.click(await screen.findByText('PLEX'));

    expect(await screen.findByText(/GPMR-01/)).toBeInTheDocument();
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    // PLEX orders still carry ordinary station ids, so Trade Hub mode's Jita filter still applies.
    expect(within(sellTable).getByText('3,000,000')).toBeInTheDocument();
    expect(hits.count).toBe(1);
  });
});

describe('Shareable Market Browser URLs (issue #4)', () => {
  it('keeps the caret and every letter when editing the middle of the search text', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    const box = await screen.findByRole('searchbox');
    await user.type(box, 'rifer{ArrowLeft}{ArrowLeft}t');
    await user.type(box, 'x{Backspace}');
    expect(box).toHaveValue('rifter');
    await waitFor(() => expect(window.location.search).toBe('?browser.q=rifter'));
  });

  it('keeps the selected item when an item is picked before the search text has settled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    // Past the search debounce: a late write must not undo the selection.
    await vi.advanceTimersByTimeAsync(450);
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    expect(params).toEqual({ 'browser.q': 'rift', type: '587', hub: 'jita' });
  });

  it('offers close spellings when a typo matches nothing', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rifetr');
    expect(await screen.findByText('Rifter')).toBeInTheDocument();
    expect(screen.getByText(/close spellings/i)).toBeInTheDocument();
  });

  it('selecting an item and changing location updates the query string', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    // The tree search box is URL-backed too (ADR 0015), written once typing
    // pauses — it rides along with every location change from here on.
    const params = () => Object.fromEntries(new URLSearchParams(window.location.search));
    await waitFor(() =>
      expect(params()).toEqual({ 'browser.q': 'rift', type: '587', hub: 'jita' })
    );

    await user.click(screen.getByRole('button', { name: 'Region' }));
    await waitFor(() =>
      expect(params()).toEqual({ 'browser.q': 'rift', type: '587', region: '10000002' })
    );
  });

  it('opening a Market Browser URL with item and location parameters restores that exact view', async () => {
    server.use(ordersHandler({ count: 0 }));
    window.history.pushState({}, '', '/market?type=587&hub=jita');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter', level: 2 })).toBeInTheDocument();
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('1,000,000')).toBeInTheDocument();
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
    expect(within(sellTable).queryByText('2,000,000')).not.toBeInTheDocument();
  });

  it('a stored region no longer among the Market Regions falls back to the hub region (issue #3891)', async () => {
    server.use(ordersHandler({ count: 0 }));
    // A wormhole region whose market emptied between SDE bakes.
    await db.settings.put({
      key: LOCATION_MODE_SETTING_KEY,
      value: { mode: 'region', regionId: 11000012 },
    });
    window.history.pushState({}, '', '/market?type=587');
    render(<App />);

    // Still Region mode, over the Jita hub's region: the player structure shows.
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('2,000,000')).toBeInTheDocument();
  });

  it('does not touch the URL while the user is still typing a search', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByRole('button', SHIPS_GROUP);
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
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByRole('heading', { name: 'Rifter', level: 2 });
    // The linked hub is copied into the device setting only once that setting
    // has hydrated; toggling before then would find the old Jita default.
    await waitFor(() => expect(useMarketBrowserHub.getState().value).toBe('amarr'));

    await user.click(screen.getByRole('button', { name: 'Region' }));
    expect(window.location.search).toBe('?type=587&region=10000043'); // Domain, Amarr's region

    await user.click(screen.getByRole('button', { name: 'Trade Hub' }));
    expect(window.location.search).toBe('?type=587&hub=amarr');
  });

  it('remembers the last picked Trade Hub across a remount, per device, without touching the synced default', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<App />);
    await screen.findByRole('button', SHIPS_GROUP);

    await user.click(screen.getByRole('combobox', { name: 'Trade Hub' }));
    await user.click(screen.getByRole('option', { name: 'Amarr' }));
    expect(screen.getByRole('combobox', { name: 'Trade Hub' })).toHaveTextContent('Amarr');

    // The device-local pick must not touch the cross-device default other
    // features (Settings, Contracts, LP Store) read — no row for it at all.
    expect(await db.settings.get('sync.marketHub')).toBeUndefined();

    unmount();
    window.history.pushState({}, '', '/market');
    render(<App />);
    await screen.findByRole('button', SHIPS_GROUP);

    expect(await screen.findByRole('combobox', { name: 'Trade Hub' })).toHaveTextContent('Amarr');
  });

  it('keeps its own Trade Hub when the synced Settings default changes underneath it', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByRole('button', SHIPS_GROUP);

    await user.click(screen.getByRole('combobox', { name: 'Trade Hub' }));
    await user.click(screen.getByRole('option', { name: 'Amarr' }));
    expect(screen.getByRole('combobox', { name: 'Trade Hub' })).toHaveTextContent('Amarr');

    // Another device (or Settings' own "Default trade hub" control) changes
    // the synced default to Dodixie — must not reach back into this page.
    await useMarketHub.getState().setValue('dodixie');

    expect(screen.getByRole('combobox', { name: 'Trade Hub' })).toHaveTextContent('Amarr');
  });

  it('browser back and forward move through previous selections', async () => {
    server.use(
      ordersHandler({ count: 0 }),
      // Tritanium's Variations table falls back to PLEX (same market group,
      // fixtures in @/test/marketMocks), whose order book lives at its own Global Market
      // Region rather than Tritanium's.
      plexOrdersHandler({ count: 0 })
    );
    const user = userEvent.setup({ delay: null });
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
