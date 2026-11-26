import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY } from '@/stores/activeCharacter';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import { ESI_BASE_URL } from '@/esi/client';
import { configureClipboard } from '@/lib/clipboard';
import { stubViewport } from '@/test/viewport';
import { STRUCTURE_HITPOINTS_ATTR_ID, TYPES } from '@/test/marketMocks';
import {
  RIFTER_REGION_ID,
  installMarketHarness,
  ordersHandler,
  pinRifterFromHeaderBell,
  server,
  renderMarketRoute,
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

describe('Quickbar unavailable with no active character (issue #7)', () => {
  it('disables the header price alert bell with a tap-reachable explanation (issue #2162)', async () => {
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    expect(await screen.findByRole('button', { name: 'Add to Quickbar' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    const bell = await screen.findByRole('button', { name: 'Set price alert' });
    expect(bell).toHaveAttribute('aria-disabled', 'true');

    fireEvent.touchStart(bell, {
      touches: [{ clientX: 0, clientY: 0 }],
      changedTouches: [{ clientX: 0, clientY: 0 }],
    });
    fireEvent.touchEnd(bell);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Select a character to use the Quickbar'
    );
  });
});

describe('Quickbar (issue #7)', () => {
  beforeEach(async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
  });

  it('shows a short hint when empty', async () => {
    renderMarketRoute();
    expect(await screen.findByText(/No items yet/)).toBeInTheDocument();
  });

  it('keeps the finder a bounded flex column: tree scrolls, Quickbar stays rendered', async () => {
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await pinRifterFromHeaderBell(user);

    const quickbar = await screen.findByTestId('quickbar');
    await within(quickbar).findByText('Rifter');
    const tree = quickbar.parentElement!.querySelector('.overflow-y-auto');
    expect(tree).toHaveClass('overflow-y-auto', 'lg:flex-1', 'lg:min-h-0');
    expect(quickbar).toHaveClass('shrink-0');
    expect(within(quickbar).getByRole('list')).toHaveClass('overflow-y-auto');
  });

  it('pins an item from the header price alert bell, and a re-save does not duplicate it', async () => {
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await pinRifterFromHeaderBell(user);

    const quickbar = await screen.findByTestId('quickbar');
    await waitFor(() => expect(within(quickbar).getAllByText('Rifter')).toHaveLength(1));

    await user.click(await screen.findByRole('button', { name: 'Set price alert' }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(quickbar).getAllByText('Rifter')).toHaveLength(1));
  });

  it('pins and unpins from the item header toggle, no target price needed', async () => {
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));

    await user.click(await screen.findByRole('button', { name: 'Add to Quickbar' }));
    const quickbar = await screen.findByTestId('quickbar');
    expect(await within(quickbar).findByText('Rifter')).toBeInTheDocument();

    const toggle = await screen.findAllByRole('button', { name: 'Remove from Quickbar' });
    const header = toggle.find((b) => b.getAttribute('aria-pressed') === 'true')!;
    await user.click(header);
    expect(await screen.findByText(/No items yet/)).toBeInTheDocument();
  });

  it('opens a ⋮ menu on a Quickbar row with Show info and Remove', async () => {
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await pinRifterFromHeaderBell(user);

    const quickbar = await screen.findByTestId('quickbar');
    await within(quickbar).findByText('Rifter');
    await user.click(within(quickbar).getByRole('button', { name: 'More actions for Rifter' }));
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument();
  });

  it('removes an item, restoring the empty hint', async () => {
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await pinRifterFromHeaderBell(user);
    await within(await screen.findByTestId('quickbar')).findByText('Rifter');

    await user.click(
      within(screen.getByTestId('quickbar')).getByRole('button', {
        name: 'More actions for Rifter',
      })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));

    expect(await screen.findByText(/No items yet/)).toBeInTheDocument();
    expect(screen.getAllByText('Quickbar item Rifter removed.').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await within(screen.getByTestId('quickbar')).findByText('Rifter')).toBeInTheDocument();
  });

  it('clicking a Quickbar item selects it and loads its order book', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();
    await pinRifterFromHeaderBell(user);
    const quickbar = await screen.findByTestId('quickbar');
    await within(quickbar).findByText('Rifter');

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'trit');
    await user.click(await screen.findByText('Tritanium'));
    await screen.findByRole('heading', { name: 'Tritanium' });

    await user.click(within(quickbar).getByRole('button', { name: /^Rifter/ }));

    await screen.findByRole('heading', { name: 'Rifter' });
    await screen.findByRole('table', { name: 'Sell Orders' });
  });

  it('survives a reload from local storage alone (Firebase sync is not configured in tests)', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderMarketRoute();
    await pinRifterFromHeaderBell(user);
    await within(await screen.findByTestId('quickbar')).findByText('Rifter');
    unmount();

    renderMarketRoute();
    const quickbar = await screen.findByTestId('quickbar');
    expect(await within(quickbar).findByText('Rifter')).toBeInTheDocument();
  });
});

describe('Market Browser order row context menu (issue #6)', () => {
  afterEach(() => configureClipboard(null));

  it("copies an order's price from the expanded row's Copy price button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    const [, sellRow] = within(sellTable).getAllByRole('row');
    await user.click(sellRow);
    await user.click(await screen.findByRole('button', { name: 'Copy price 1,000,000' }));

    expect(writeText).toHaveBeenCalledWith('1000000');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('copies the location and price to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
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
    expect(writeText).toHaveBeenCalledWith('1000000');
  });

  it('copies a price with cents as plain digits (#2294)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${RIFTER_REGION_ID}/orders`, () =>
        HttpResponse.json([
          {
            order_id: 1,
            type_id: 587,
            is_buy_order: false,
            price: 12.34,
            location_id: 60003760,
            system_id: 30000142,
            volume_remain: 5,
            volume_total: 10,
            min_volume: 1,
            duration: 90,
            issued: '2026-08-01T00:00:00Z',
            range: 'region',
          },
        ])
      )
    );
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    const [, sellRow] = within(sellTable).getAllByRole('row');
    await user.click(sellRow);
    await user.click(await screen.findByRole('button', { name: 'Copy price 12.34' }));

    expect(writeText).toHaveBeenCalledWith('12.34');
  });

  it('opens the Item Detail modal from an order row (issue #9)', async () => {
    server.use(
      ordersHandler({ count: 0 }),
      http.get(`${ESI_BASE_URL}/universe/types/587`, () =>
        HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: 'A rugged little frigate.',
          group_id: 25,
          published: true,
          dogma_attributes: [{ attribute_id: STRUCTURE_HITPOINTS_ATTR_ID, value: 1200 }],
        })
      )
    );
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    const [, sellRow] = within(sellTable).getAllByRole('row');
    sellRow.focus();
    fireEvent.contextMenu(sellRow);

    await user.click(await screen.findByRole('menuitem', { name: 'Show info' }));

    const dialog = await screen.findByRole('dialog', { name: 'Rifter' });
    expect(await within(dialog).findByText('Structure Hitpoints')).toBeInTheDocument();
  });

  it("Add to Skill Plan from the item's Required skills creates the plan and shows it was added", async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
    server.use(
      ordersHandler({ count: 0 }),
      http.get(`${ESI_BASE_URL}/universe/types/587`, () =>
        HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: 'A rugged little frigate.',
          group_id: 25,
          published: true,
          dogma_attributes: [
            { attribute_id: 182, value: 3327 },
            { attribute_id: 277, value: 1 },
          ],
        })
      ),
      http.get(`${ESI_BASE_URL}/characters/1/skills`, () =>
        HttpResponse.json({ skills: [], total_sp: 0, unallocated_sp: 0 })
      )
    );
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });

    await user.click(await screen.findByRole('button', { name: /^Required skills/i }));
    const addButton = await screen.findByRole('button', { name: 'Create Skill Plan and add' });
    await user.click(addButton);

    expect(await screen.findByRole('button', { name: 'Added' })).toBeInTheDocument();

    const plans = await db.skillPlans.where('characterId').equals(1).toArray();
    expect(plans).toHaveLength(1);
    expect(plans[0].entries).toEqual([{ skillTypeID: 3327, targetLevel: 1 }]);
  });

  it('filters the book to one station, undone via the banner', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    await user.type(await screen.findByRole('searchbox'), 'rift');
    await user.click(await screen.findByText('Rifter'));
    await screen.findByRole('table', { name: 'Sell Orders' });
    await user.click(screen.getByRole('button', { name: 'Region' }));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(within(sellTable).getByText('2,000,000')).toBeInTheDocument();
    const [, sellRow] = within(sellTable).getAllByRole('row');
    sellRow.focus();
    fireEvent.contextMenu(sellRow);

    await user.click(await screen.findByRole('menuitem', { name: 'Filter to this station' }));

    expect(
      await screen.findByText(/Filtered to Jita IV - Moon 4 - Caldari Navy Assembly Plant/)
    ).toBeInTheDocument();
    expect(
      within(await screen.findByRole('table', { name: 'Sell Orders' })).queryByText('2,000,000')
    ).not.toBeInTheDocument();
    expect(
      within(await screen.findByRole('table', { name: 'Buy Orders' })).getByText('500,000')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(
      within(await screen.findByRole('table', { name: 'Sell Orders' })).getByText('2,000,000')
    ).toBeInTheDocument();
  });
});

describe('Market Browser narrow-screen layout (issue #4)', () => {
  it('shows one column at a time, with a back control that returns to the finder', async () => {
    server.use(ordersHandler({ count: 0 }));
    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

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
    expect(screen.getByRole('searchbox')).toHaveValue('rift');
    expect(screen.getByText('Rifter')).toBeInTheDocument();
  });

  it('keeps the desktop two-column layout unchanged, with no back control', async () => {
    server.use(ordersHandler({ count: 0 }));
    stubViewport(() => true);

    const user = userEvent.setup({ delay: null });
    renderMarketRoute();

    const searchBox = await screen.findByRole('searchbox');
    const finderPanel = searchBox.closest('section');
    await user.type(searchBox, 'rift');
    await user.click(await screen.findByText('Rifter'));

    expect(finderPanel).not.toHaveClass('hidden');
    const itemPanel = screen.getByRole('heading', { name: 'Rifter', level: 2 }).closest('section');
    expect(itemPanel).not.toHaveClass('hidden');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('Market Browser', () => {
  it('points an empty blueprint order book at the BPC search, since copies are contract-only', async () => {
    vi.mocked(loadMarketTypes).mockResolvedValueOnce([
      ...TYPES,
      { typeId: 638, name: 'Rifter Blueprint', marketGroupId: 2, volume: 1 },
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );
    window.history.pushState({}, '', '/market?type=638');

    renderMarketRoute();

    expect(
      await screen.findByText('Copies of this blueprint are traded on contract, not on the market.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search BPC contracts' })).toHaveAttribute(
      'href',
      '/industry/sourcing?sourcing.type=638'
    );
  });

  it('does not point a blueprint at the BPC search when its order book failed to load', async () => {
    vi.mocked(loadMarketTypes).mockResolvedValueOnce([
      ...TYPES,
      { typeId: 638, name: 'Rifter Blueprint', marketGroupId: 2, volume: 1 },
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, () =>
        HttpResponse.json({ error: 'Internal error' }, { status: 500 })
      )
    );
    window.history.pushState({}, '', '/market?type=638');

    renderMarketRoute();

    expect(await screen.findByText("Couldn't load the order book")).toBeInTheDocument();
    expect(
      screen.queryByText('Copies of this blueprint are traded on contract, not on the market.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Search BPC contracts' })).not.toBeInTheDocument();
  });

  it('leaves a non-blueprint empty order book alone', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );
    window.history.pushState({}, '', '/market?type=587');

    renderMarketRoute();

    expect(await screen.findByText('No sell orders')).toBeInTheDocument();
    expect(
      screen.getByText('No one is selling this item at this location right now.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Search BPC contracts' })).not.toBeInTheDocument();
  });
});
