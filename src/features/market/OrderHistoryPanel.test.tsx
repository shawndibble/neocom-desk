import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { OrderHistoryPanel } from './OrderHistoryPanel';
import { loadOrderHistory } from '@/features/character/orders';
import { loadTypeNames } from '@/features/character/typeNames';
import type { MarketOrderHistory } from '@/esi/endpoints';

vi.mock('@/features/character/orders', () => ({ loadOrderHistory: vi.fn() }));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/lib/downloadCsv', () => ({ downloadCsv: vi.fn() }));
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
  const onAddToQuickbar = vi.fn();
  const onShowInfo = vi.fn();
  const onRequestBlueprintCatalog = vi.fn();
  const onViewChange = vi.fn();
  render(
    <MemoryRouter initialEntries={['/market/history']}>
      <OrderHistoryPanel
        onViewChange={onViewChange}
        blueprintCatalog={null}
        onRequestBlueprintCatalog={onRequestBlueprintCatalog}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable
        onShowInfo={onShowInfo}
      />
    </MemoryRouter>
  );
  return { onAddToQuickbar, onShowInfo, onRequestBlueprintCatalog, onViewChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  mockedTypeNames.mockResolvedValue(TYPE_NAMES);
});

describe('OrderHistoryPanel — the row as an item', () => {
  it('carries the item context menu on every row', async () => {
    mockedLoadHistory.mockResolvedValue({
      cached: {
        data: [historyOrder()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const { onShowInfo } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(onShowInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  it('asks for the blueprint catalog the first time a row menu opens', async () => {
    mockedLoadHistory.mockResolvedValue({
      cached: {
        data: [historyOrder()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const { onRequestBlueprintCatalog } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('row', { name: /Damage Control II/ }));
    expect(onRequestBlueprintCatalog).toHaveBeenCalled();
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

  it('shows item, filled and shorthand price per row, and opens the rest on tap', async () => {
    load([historyOrder({ volume_remain: 1, volume_total: 3 })]);
    renderPanel();

    const toggle = await screen.findByRole('button', { name: /Damage Control II/ });
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(toggle).getByText('2/3')).toBeInTheDocument();
    expect(within(toggle).getByText('460.8K')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('460,800.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View in market' })).toHaveAttribute(
      'href',
      expect.stringContaining('2048')
    );
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
    await screen.findByRole('button', { name: /Cheap Thing/ });

    const names = () =>
      screen
        .getAllByRole('button', { name: /Thing/ })
        .map((b) => b.textContent?.match(/(Cheap|Pricey) Thing/)?.[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Price' }));
    expect(names()).toEqual(['Cheap Thing', 'Pricey Thing']);
    fireEvent.click(screen.getByRole('button', { name: 'Price, sorted ascending' }));
    expect(names()).toEqual(['Pricey Thing', 'Cheap Thing']);
  });

  it('carries the item context menu on every row', async () => {
    load([historyOrder()]);
    renderPanel();
    fireEvent.contextMenu(await screen.findByRole('button', { name: /Damage Control II/ }));
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });
});
