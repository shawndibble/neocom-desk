import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    <MemoryRouter initialEntries={['/market?section=history']}>
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
