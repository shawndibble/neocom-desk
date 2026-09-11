import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    <MemoryRouter initialEntries={['/market?section=transactions']}>
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
