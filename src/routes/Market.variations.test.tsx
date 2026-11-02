import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY } from '@/stores/activeCharacter';
import { ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';
import { loadMarketGroups, loadMarketTypes, loadVariations } from '@/sde/loadMarketSde';
import { useCompareSet } from '@/features/market/compareSet';
import { ESI_BASE_URL } from '@/esi/client';
import { App } from '@/app/App';
import {
  CORAX_TYPE_ID,
  CORMORANT_TYPE_ID,
  GROUPS,
  KESTREL_TYPE_ID,
  MERLIN_TYPE_ID,
  STRUCTURE_HITPOINTS_ATTR_ID,
  TYPES,
} from '@/test/marketMocks';
import {
  destroyerOrdersHandler,
  installMarketHarness,
  openVariationsTab,
  ordersHandler,
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

describe('Variations table (issue #145, formerly the Related Items strip of issue #10)', () => {
  it("falls back to the selected item's Market Group siblings when it has no variation data, showing each sibling's own sell and buy price, excluding itself, and never conflating a missing side with true 'no orders at all'", async () => {
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    await screen.findByRole('table', { name: 'Sell Orders' });

    const table = await openVariationsTab(user);
    expect(await within(table).findByText('Kestrel')).toBeInTheDocument();
    expect(within(table).getByText('1,500,000 ISK', { selector: '.sr-only' })).toBeInTheDocument();

    // Corax has a buy order but no sell order — the Sell cell says so
    // plainly rather than showing a fabricated zero, and the Buy cell still
    // shows its own real price.
    const coraxRow = within(table).getByText('Corax').closest('tr');
    if (!coraxRow) throw new Error('expected a Corax row');
    expect(within(coraxRow).getByText('No sell orders')).toBeInTheDocument();
    expect(within(coraxRow).getByText('700,000 ISK', { selector: '.sr-only' })).toBeInTheDocument();

    // Cormorant has no orders on either side — each cell independently says
    // so, never conflated with Corax's buy-only state.
    const cormorantRow = within(table).getByText('Cormorant').closest('tr');
    if (!cormorantRow) throw new Error('expected a Cormorant row');
    expect(within(cormorantRow).getAllByText('No orders')).toHaveLength(2);
  });

  it('shows the variation group, not Market Group siblings, when the selected item has variation data', async () => {
    vi.mocked(loadVariations).mockResolvedValueOnce({
      types: {
        [MERLIN_TYPE_ID]: { parentTypeId: null, metaGroupId: 1 },
        [KESTREL_TYPE_ID]: { parentTypeId: MERLIN_TYPE_ID, metaGroupId: 2 },
      },
      metaGroups: { 1: 'Tech I', 2: 'Tech II' },
    });
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    await screen.findByRole('table', { name: 'Sell Orders' });

    const table = await openVariationsTab(user);
    // Kestrel is Merlin's Tech II variant, not a Market Group sibling here —
    // Corax and Cormorant (Market Group siblings, no variation entry) are
    // excluded once the variation group resolves.
    const kestrelRow = await within(table)
      .findByText('Kestrel')
      .then((el) => el.closest('tr'));
    if (!kestrelRow) throw new Error('expected a Kestrel row');
    expect(within(kestrelRow).getByText('T2')).toBeInTheDocument();
    expect(within(table).queryByText('Corax')).not.toBeInTheDocument();
    expect(within(table).queryByText('Cormorant')).not.toBeInTheDocument();
  });

  it('opens the Compare drawer on Attributes from the Variations header button, with the selected item plus a column per row shown in the table (issue #146, folded into the drawer by #1425)', async () => {
    const dogma = (typeId: number, hp: number) =>
      http.get(`${ESI_BASE_URL}/universe/types/${typeId}`, () =>
        HttpResponse.json({
          type_id: typeId,
          name: `Type ${typeId}`,
          description: 'A ship.',
          group_id: 25,
          published: true,
          dogma_attributes: [{ attribute_id: STRUCTURE_HITPOINTS_ATTR_ID, value: hp }],
        })
      );
    server.use(
      destroyerOrdersHandler(new Map()),
      dogma(MERLIN_TYPE_ID, 1100),
      dogma(KESTREL_TYPE_ID, 1200),
      dogma(CORAX_TYPE_ID, 1400),
      dogma(CORMORANT_TYPE_ID, 1600)
    );

    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    await openVariationsTab(user);

    await user.click(screen.getByRole('button', { name: 'Compare' }));

    const region = await screen.findByRole('region', { name: 'Compare' });
    expect(
      within(region).getByRole('button', { name: 'Attributes', pressed: true })
    ).toBeInTheDocument();
    // A column per row the table is showing, plus the selected item itself
    // (owner decision #2). Each name repeats once per attribute category,
    // since the matrix is one DataTable per category (#1128).
    expect(await within(region).findAllByText('Merlin')).not.toHaveLength(0);
    expect(within(region).getAllByText('Kestrel')).not.toHaveLength(0);
    expect(within(region).getAllByText('Corax')).not.toHaveLength(0);
    // Estimated Price leads, then the dogma rows fetched for the matrix.
    expect(within(region).getByText('Estimated Price')).toBeInTheDocument();
    expect(within(region).getByText('1,200 HP')).toBeInTheDocument();
  });

  it('shows an Undo toast after Variations Compare that removes only the rows that add introduced (issue #1746)', async () => {
    server.use(destroyerOrdersHandler(new Map()));
    useCompareSet.setState({ items: [{ typeId: 999999, itemName: 'Pre-existing' }] });

    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    await openVariationsTab(user);

    await user.click(screen.getByRole('button', { name: 'Compare' }));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(screen.getAllByText(/Added \d+ variants of Merlin/).length).toBeGreaterThan(0);
    expect(useCompareSet.getState().items.length).toBeGreaterThan(2);

    await user.click(undo);
    expect(useCompareSet.getState().items).toEqual([{ typeId: 999999, itemName: 'Pre-existing' }]);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('right-clicks a Variations row to open its item context menu, including Compare Variations (issue #147)', async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    const table = await openVariationsTab(user);

    const kestrelRow = within(table).getByText('Kestrel').closest('tr');
    if (!kestrelRow) throw new Error('expected a Kestrel row');
    kestrelRow.focus();
    fireEvent.contextMenu(kestrelRow);

    // Quickbar, price alert and stock target fold into one submenu.
    expect(screen.getByRole('menuitem', { name: 'Track' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Compare Variations' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
  });

  it("opens the Compare drawer on Attributes from a row's Compare Variations action, same as the header button (issue #147, folded into the drawer by #1425)", async () => {
    const dogma = (typeId: number, hp: number) =>
      http.get(`${ESI_BASE_URL}/universe/types/${typeId}`, () =>
        HttpResponse.json({
          type_id: typeId,
          name: `Type ${typeId}`,
          description: 'A ship.',
          group_id: 25,
          published: true,
          dogma_attributes: [{ attribute_id: STRUCTURE_HITPOINTS_ATTR_ID, value: hp }],
        })
      );
    server.use(
      destroyerOrdersHandler(new Map()),
      dogma(MERLIN_TYPE_ID, 1100),
      dogma(KESTREL_TYPE_ID, 1200),
      dogma(CORAX_TYPE_ID, 1400),
      dogma(CORMORANT_TYPE_ID, 1600)
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    const table = await openVariationsTab(user);

    const kestrelRow = within(table).getByText('Kestrel').closest('tr');
    if (!kestrelRow) throw new Error('expected a Kestrel row');
    fireEvent.contextMenu(kestrelRow);
    await user.click(screen.getByRole('menuitem', { name: 'Compare Variations' }));

    const region = await screen.findByRole('region', { name: 'Compare' });
    expect(await within(region).findAllByText('Merlin')).not.toHaveLength(0);
    expect(within(region).getAllByText('Kestrel')).not.toHaveLength(0);
    expect(within(region).getAllByText('Corax')).not.toHaveLength(0);
  });

  it('right-clicking a Variations row opens the menu without also re-anchoring on it (left/right-click non-interference, issue #147)', async () => {
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    const table = await openVariationsTab(user);

    const kestrelRow = within(table).getByText('Kestrel').closest('tr');
    if (!kestrelRow) throw new Error('expected a Kestrel row');
    fireEvent.contextMenu(kestrelRow);

    await screen.findByRole('menuitem', { name: 'Show info' });
    // Menu open: Radix marks the rest of the page aria-hidden, so the
    // heading check below has to wait until Escape closes it again.
    await user.keyboard('{Escape}');

    expect(screen.getByRole('heading', { name: 'Merlin', level: 2 })).toBeInTheDocument();
  });

  it('a failed variations.json fetch degrades only the Variations table to its sibling fallback, not the whole Market route', async () => {
    vi.mocked(loadVariations).mockRejectedValueOnce(new Error('network error'));
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));

    // The order book — unrelated to variations.json — still renders fine.
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('900,000')).toBeInTheDocument();
    // The Variations table degrades to the sibling fallback rather than
    // going empty or taking the whole route down with it.
    const table = await openVariationsTab(user);
    expect(within(table).getByText('Kestrel')).toBeInTheDocument();
  });

  it('clicking a row selects it, reloading the order book and re-anchoring the table on it', async () => {
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    const before = await openVariationsTab(user);

    await user.click(await within(before).findByText('Kestrel'));

    // Re-anchored: Merlin, the previously-selected item, is now a row. The
    // Variations tab stays open across the selection, like Price History.
    const table = await screen.findByRole('table', { name: 'Variations' });
    expect(await within(table).findByText('Merlin')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Order Book' }));
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('1,500,000')).toBeInTheDocument();
  });

  it('re-anchors on a click anywhere in the row, not just the item name — identical to the old card click', async () => {
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    const table = await openVariationsTab(user);

    // Click the row itself, not the Name cell.
    const kestrelRow = within(table).getByText('Kestrel').closest('tr');
    if (!kestrelRow) throw new Error('expected a Kestrel row');
    await user.click(kestrelRow);

    await user.click(await screen.findByRole('tab', { name: 'Order Book' }));
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,500,000')).toBeInTheDocument();
  });

  it('a manual Refresh also refetches row prices, not just the on-screen order book', async () => {
    const hits = new Map<number, number>();
    server.use(destroyerOrdersHandler(hits));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    await screen.findByRole('table', { name: 'Sell Orders' });
    await openVariationsTab(user);
    await waitFor(() => expect(hits.get(KESTREL_TYPE_ID)).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(hits.get(KESTREL_TYPE_ID)).toBe(2));
    expect(hits.get(MERLIN_TYPE_ID)).toBe(2);
  });

  it('respects the order-row station filter, matching the on-screen tables (GLOSSARY.md round 10)', async () => {
    server.use(destroyerOrdersHandler(new Map()));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'merlin');
    await user.click(await screen.findByText('Merlin'));
    await user.click(screen.getByRole('button', { name: 'Region' })); // reveal Merlin's second, out-of-hub order

    expect(
      within(await screen.findByRole('table', { name: 'Sell Orders' })).getByText('850,000')
    ).toBeInTheDocument();
    const unfiltered = await openVariationsTab(user);
    expect(
      await within(unfiltered).findByText('1,500,000 ISK', { selector: '.sr-only' })
    ).toBeInTheDocument(); // Kestrel, unfiltered

    await user.click(screen.getByRole('tab', { name: 'Order Book' }));
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    const rows = within(sellTable).getAllByRole('row');
    const targetRow = rows.find((row) => within(row).queryByText('850,000'));
    if (!targetRow) throw new Error('expected a row with the out-of-hub Merlin order');
    targetRow.focus();
    fireEvent.contextMenu(targetRow);
    await user.click(await screen.findByRole('menuitem', { name: 'Filter to this station' }));
    await screen.findByText(/^Filtered to/);

    // Kestrel and Corax have no orders at all at that location — the table
    // degrades exactly as the on-screen tables do under the same filter.
    const table = await openVariationsTab(user);
    await waitFor(() => {
      expect(
        within(table).queryByText('1,500,000 ISK', { selector: '.sr-only' })
      ).not.toBeInTheDocument();
    });
    expect(within(table).getAllByText('No orders').length).toBeGreaterThanOrEqual(2);
  });

  it('an item whose Market Group has no other members shows nothing, not an empty table', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });

    // The tab stays (a tab that comes and goes per item moves the others),
    // but it carries no count and opens on a plain empty state.
    await user.click(screen.getByRole('tab', { name: 'Variations' }));
    expect(await screen.findByText('No variations for this item')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Variations' })).not.toBeInTheDocument();
  });

  it('renders every sibling of a large Market Group, uncapped', async () => {
    const bigGroupId = 99;
    const selected: MarketTypeEntry = {
      typeId: 1999,
      name: 'Selected Widget',
      marketGroupId: bigGroupId,
      volume: 1,
    };
    const many: MarketTypeEntry[] = Array.from({ length: 25 }, (_, i) => ({
      typeId: 2000 + i,
      name: `Widget ${i}`,
      marketGroupId: bigGroupId,
      volume: 1,
    }));
    vi.mocked(loadMarketGroups).mockResolvedValueOnce([
      ...GROUPS,
      { id: bigGroupId, name: 'Widgets', parentId: null, hasTypes: true },
    ]);
    vi.mocked(loadMarketTypes).mockResolvedValueOnce([...TYPES, selected, ...many]);
    server.use(
      http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );

    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'Selected Widget');
    await user.click(await screen.findByText('Selected Widget'));

    const table = await openVariationsTab(user);
    expect(within(table).getAllByRole('row')).toHaveLength(26); // header + all 25 siblings, uncapped
  });

  it('fetches variation row prices a few at a time, never as one simultaneous burst (Sentry N+1 API Call)', async () => {
    const bigGroupId = 99;
    const selected: MarketTypeEntry = {
      typeId: 1999,
      name: 'Selected Widget',
      marketGroupId: bigGroupId,
      volume: 1,
    };
    const many: MarketTypeEntry[] = Array.from({ length: 25 }, (_, i) => ({
      typeId: 2000 + i,
      name: `Widget ${i}`,
      marketGroupId: bigGroupId,
      volume: 1,
    }));
    vi.mocked(loadMarketGroups).mockResolvedValueOnce([
      ...GROUPS,
      { id: bigGroupId, name: 'Widgets', parentId: null, hasTypes: true },
    ]);
    vi.mocked(loadMarketTypes).mockResolvedValueOnce([...TYPES, selected, ...many]);
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchedTypeIds = new Set<string>();
    server.use(
      http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, async ({ request }) => {
        fetchedTypeIds.add(new URL(request.url).searchParams.get('type_id') ?? '');
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(20);
        inFlight -= 1;
        return HttpResponse.json([], { headers: { 'X-Pages': '1' } });
      })
    );

    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'Selected Widget');
    await user.click(await screen.findByText('Selected Widget'));

    // The selected item's own book plus every one of its 25 siblings' —
    // fetching is uncapped, same as rendering (#1217's cap was on
    // concurrency, never on row count; the render-side row cap this number
    // used to match was removed separately, and this count went stale
    // instead of following it — see "renders every sibling of a large
    // Market Group, uncapped" above).
    await waitFor(() => expect(fetchedTypeIds.size).toBe(26), { timeout: 3000 });
    // The main order book runs alongside the variation workers.
    expect(maxInFlight).toBeLessThanOrEqual(ORDER_BOOK_FANOUT_CONCURRENCY + 1);
  });
});

/**
 * Selects Rifter from the tree, then pins it through the item header's price
 * alert bell (the tree leaf has no menu; the bell's Save pins and sets the
 * target in one step).
 */
describe('Market Browser tree leaf (issue #6)', () => {
  beforeEach(async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
  });

  it('has no custom right-click menu and no More actions button: the row click opens the item', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    const item = await screen.findByText('Rifter');
    fireEvent.contextMenu(item);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^More actions/ })).not.toBeInTheDocument();
  });

  it('opens the Item Detail modal from the item header Info button (issue #9), reading live ESI attributes', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/587`, () =>
        HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: 'A rugged little frigate.',
          group_id: 25,
          published: true,
          volume: 27289,
          dogma_attributes: [{ attribute_id: STRUCTURE_HITPOINTS_ATTR_ID, value: 1200 }],
        })
      )
    );

    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Show info' }));

    const dialog = await screen.findByRole('dialog', { name: 'Rifter' });
    expect(await within(dialog).findByText('A rugged little frigate.')).toBeInTheDocument();
    expect(within(dialog).getByText('Structure Hitpoints')).toBeInTheDocument();
    expect(within(dialog).getByText('1,200 HP')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Compare toggle in the item header', () => {
  it('adds the selected item to the Compare Set and removes it again', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add to Compare' }));
    expect(useCompareSet.getState().items).toEqual([{ typeId: 587, itemName: 'Rifter' }]);

    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from Compare' }));
    expect(useCompareSet.getState().items).toEqual([]);
  });
});
