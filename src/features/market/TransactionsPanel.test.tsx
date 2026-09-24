import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { TransactionsPanel } from './TransactionsPanel';
import { loadWalletTransactions } from '@/features/character/wallet';
import { loadTypeNames } from '@/features/character/typeNames';
import type { WalletTransaction } from '@/esi/endpoints';

vi.mock('@/features/character/wallet', () => ({ loadWalletTransactions: vi.fn() }));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/lib/downloadCsv', () => ({ downloadCsv: vi.fn() }));

const mockedLoadTransactions = vi.mocked(loadWalletTransactions);
const mockedTypeNames = vi.mocked(loadTypeNames);

const TYPE_NAMES = new Map([[2048, 'Damage Control II']]);

function transaction(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    transaction_id: 1,
    date: new Date().toISOString(),
    location_id: 60003760,
    type_id: 2048,
    unit_price: 460_800,
    quantity: 3,
    client_id: 999,
    is_buy: false,
    journal_ref_id: 1,
    is_personal: true,
    ...overrides,
  };
}

function renderPanel() {
  const onAddToQuickbar = vi.fn();
  const onShowInfo = vi.fn();
  const onRequestBlueprintCatalog = vi.fn();
  const onViewChange = vi.fn();
  render(
    <MemoryRouter initialEntries={['/market/history/transactions']}>
      <TransactionsPanel
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

describe('TransactionsPanel — the row as an item', () => {
  it('carries the item context menu on every row', async () => {
    mockedLoadTransactions.mockResolvedValue({
      data: [transaction()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    const { onShowInfo } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(onShowInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  it('asks for the blueprint catalog the first time a row menu opens', async () => {
    mockedLoadTransactions.mockResolvedValue({
      data: [transaction()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    const { onRequestBlueprintCatalog } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('row', { name: /Damage Control II/ }));
    expect(onRequestBlueprintCatalog).toHaveBeenCalled();
  });
});

describe('TransactionsPanel — phone', () => {
  const original = window.matchMedia;
  const originalScroll = Element.prototype.scrollIntoView;
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
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    window.matchMedia = original;
    Element.prototype.scrollIntoView = originalScroll;
  });

  function load(data: WalletTransaction[], truncated = false) {
    mockedLoadTransactions.mockResolvedValue({
      data,
      fetchedAt: new Date(),
      fromCache: false,
      truncated,
    });
  }

  it('groups fills by day with a signed net per day and a Sold / Bought / Net strip', async () => {
    load([
      transaction({ transaction_id: 1, date: '2026-09-20T13:27:00Z' }),
      transaction({
        transaction_id: 2,
        date: '2026-09-20T12:00:00Z',
        is_buy: true,
        quantity: 1,
        unit_price: 100_000,
      }),
    ]);
    renderPanel();

    expect(await screen.findAllByRole('link', { name: 'Damage Control II' })).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
    const summary = screen.getByRole('region', { name: 'Totals for the transactions shown' });
    expect(within(summary).getByText('+1,382,400')).toBeInTheDocument();
    expect(within(summary).getByText('-100,000')).toBeInTheDocument();
    expect(within(summary).getByText('+1,282,400')).toBeInTheDocument();
    // Day net and a row total both carry their sign, not colour alone.
    expect(screen.getByText('+1,282,400.00')).toBeInTheDocument();
    expect(screen.getByText('+1,382,400.00')).toBeInTheDocument();
    expect(screen.getByText('-100,000.00')).toBeInTheDocument();
  });

  it('pulses the fill a notification pointed at', async () => {
    load([transaction({ transaction_id: 7 })]);
    render(
      <MemoryRouter initialEntries={['/market/history/transactions?highlight=2048']}>
        <TransactionsPanel
          onViewChange={vi.fn()}
          blueprintCatalog={null}
          onRequestBlueprintCatalog={vi.fn()}
          onAddToQuickbar={vi.fn()}
          quickbarAvailable
          onShowInfo={vi.fn()}
        />
      </MemoryRouter>
    );
    const link = await screen.findByRole('link', { name: 'Damage Control II' });
    const row = link.closest('[data-row-key]');
    expect(row).toHaveAttribute('data-row-key', '7');
    expect(row).toHaveClass('row-pulse');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('switches to Ended orders from the header toggle', async () => {
    load([transaction()]);
    const { onViewChange } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Ended orders' }));
    expect(onViewChange).toHaveBeenCalledWith('history');
  });
});
