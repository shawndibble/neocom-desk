import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import * as download from '@/lib/download';
import { OrderHistoryPanel } from './OrderHistoryPanel';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';
import { loadOrderHistory } from '@/features/character/orders';
import { loadTypeNames } from '@/features/character/typeNames';
import type { MarketOrderHistory } from '@/esi/endpoints';

vi.mock('@/features/character/orders', () => ({ loadOrderHistory: vi.fn() }));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn() }));

const mockedLoadHistory = vi.mocked(loadOrderHistory);
const mockedTypeNames = vi.mocked(loadTypeNames);

const TYPE_NAMES = new Map([[2048, 'Damage Control II']]);

function historyOrder(overrides: Partial<MarketOrderHistory> = {}): MarketOrderHistory {
  return {
    order_id: 1,
    type_id: 2048,
    region_id: 10_000_002,
    location_id: 60_003_760,
    is_buy_order: false,
    is_corporation: false,
    price: 460_800,
    volume_remain: 0,
    volume_total: 3,
    issued: new Date().toISOString(),
    duration: 90,
    range: 'station',
    state: 'expired',
    ...overrides,
  };
}

function renderPanel() {
  const actions = fakeItemActions();
  const onViewChange = vi.fn();
  render(
    <MemoryRouter initialEntries={['/market/history']}>
      <FakeItemActions actions={actions}>
        <OrderHistoryPanel onViewChange={onViewChange} />
      </FakeItemActions>
    </MemoryRouter>
  );
  return { actions, onViewChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  mockedTypeNames.mockResolvedValue(TYPE_NAMES);
});

describe('OrderHistoryPanel — the row as an item', () => {
  it('has no row menu or More actions button: the item name links to the Market', async () => {
    mockedLoadHistory.mockResolvedValue({
      cached: {
        data: [historyOrder()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    renderPanel();

    const row = await screen.findByRole('row', { name: /Damage Control II/ });
    expect(within(row).getByRole('link', { name: 'Damage Control II' })).toHaveAttribute(
      'href',
      expect.stringContaining('2048')
    );
    fireEvent.contextMenu(row);

    // Right-click may still offer the table's own Export; never item actions.
    expect(screen.queryByRole('menuitem', { name: 'Show info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^More actions/ })).not.toBeInTheDocument();
  });

  it('exports a truncated fetch from the title-bar menu as a -partial file', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    const user = userEvent.setup();
    mockedLoadHistory.mockResolvedValue({
      cached: {
        data: [historyOrder()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: true,
      },
      needsReauth: false,
    });
    renderPanel();
    await screen.findByRole('row', { name: /Damage Control II/ });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Ended orders' }), {
      button: 0,
      pointerType: 'mouse',
    });
    (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(spy.mock.calls[0][0]).toMatch(/^neocom-orders-history-\d{4}-\d{2}-\d{2}-partial\.csv$/);
    expect(spy.mock.calls[0][1]).toContain('"Damage Control II","Sell",460800,0,3,');
    spy.mockRestore();
  });
});

describe('OrderHistoryPanel — filtered to zero', () => {
  it('shows a hint naming which filters to clear when the search matches nothing', async () => {
    mockedLoadHistory.mockResolvedValue({
      cached: {
        data: [historyOrder()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('row', { name: /Damage Control II/ });

    await user.type(screen.getByPlaceholderText('Search by item…'), 'nonexistent item');

    await waitFor(() =>
      expect(screen.getByText('No orders match your filters.')).toBeInTheDocument()
    );
    expect(
      screen.getByText(
        'Clear the search or reset the buy/sell and status filters to see every order.'
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByRole('row', { name: /Damage Control II/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by item…')).toHaveValue('');
  });

  it('resets a non-search filter (a side chip) that empties the list', async () => {
    mockedLoadHistory.mockResolvedValue({
      cached: {
        data: [historyOrder()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('row', { name: /Damage Control II/ });

    // The fixture is a sell order — the Buy chip alone empties the list.
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Buy' }));

    await waitFor(() =>
      expect(screen.getByText('No orders match your filters.')).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByRole('row', { name: /Damage Control II/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('OrderHistoryPanel — phone', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    // `useIsPhone` reads a max-width query; answering yes is how a phone looks under test.
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
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  function load(data: MarketOrderHistory[]) {
    mockedLoadHistory.mockResolvedValue({
      cached: { data, fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
    });
  }

  it('stays a plain table, shedding issued and state below sm', async () => {
    load([historyOrder({ volume_remain: 1, volume_total: 3 })]);
    renderPanel();

    const row = await screen.findByRole('row', { name: /Damage Control II/ });
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(within(row).getByText('1 / 3')).toBeInTheDocument();
    const cell = (label: string) => row.querySelector(`td[data-label="${label}"]`);
    expect(cell('Issued')).toHaveClass('max-sm:hidden');
    expect(cell('State')).toHaveClass('max-sm:hidden');
    expect(cell('Price')).not.toHaveClass('max-sm:hidden');
  });

  it('sorts by price from the column header', async () => {
    mockedTypeNames.mockResolvedValue(
      new Map([
        [1, 'Cheap Thing'],
        [2, 'Pricey Thing'],
      ])
    );
    load([
      historyOrder({ order_id: 1, type_id: 1, price: 10 }),
      historyOrder({ order_id: 2, type_id: 2, price: 1_000 }),
    ]);
    renderPanel();
    await screen.findByRole('row', { name: /Cheap Thing/ });

    const names = () =>
      screen
        .getAllByRole('row')
        .map((r) => r.textContent?.match(/(Cheap|Pricey) Thing/)?.[0])
        .filter(Boolean);
    fireEvent.click(screen.getByRole('button', { name: /^Price/ }));
    expect(names()).toEqual(['Cheap Thing', 'Pricey Thing']);
    fireEvent.click(screen.getByRole('button', { name: /^Price/ }));
    expect(names()).toEqual(['Pricey Thing', 'Cheap Thing']);
  });
});
