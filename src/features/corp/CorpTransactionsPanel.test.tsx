import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CorpTransactionsPanel } from './CorpTransactionsPanel';
import { EMPTY_WALLET_TRANSACTION_FILTER } from '@/features/character/walletTransactionFilter';
import type { CorporationWalletTransaction } from '@/esi/endpoints';

vi.mock('@/lib/downloadCsv', () => ({ downloadCsv: vi.fn() }));

function transaction(
  overrides: Partial<CorporationWalletTransaction> = {}
): CorporationWalletTransaction {
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
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof CorpTransactionsPanel>[0]> = {}) {
  const onAddToQuickbar = vi.fn();
  const onShowInfo = vi.fn();
  const txns = [transaction()];
  render(
    <MemoryRouter>
      <CorpTransactionsPanel
        transactionsResult={{
          data: txns,
          fetchedAt: new Date(),
          fromCache: false,
          truncated: false,
        }}
        transactions={txns}
        filteredTransactions={txns}
        loading={false}
        filter={EMPTY_WALLET_TRANSACTION_FILTER}
        onFilterChange={vi.fn()}
        nameFor={() => 'Damage Control II'}
        divisionQualifier={undefined}
        offlineTitleKey="common.offlineTitle"
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable
        onShowInfo={onShowInfo}
        {...overrides}
      />
    </MemoryRouter>
  );
  return { onAddToQuickbar, onShowInfo };
}

describe('CorpTransactionsPanel — the row as an item', () => {
  it('carries the item context menu on every row', async () => {
    const { onShowInfo } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(onShowInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });
});
