import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        sort={{ columnId: 'date', direction: 'desc' }}
        onSortChange={vi.fn()}
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
  it('opens the same menu from a visible More actions button on the row (#1497)', async () => {
    const user = userEvent.setup();
    const { onShowInfo } = renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'More actions for Damage Control II' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Show info' }));

    expect(onShowInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  it('carries the item context menu on every row', async () => {
    const { onShowInfo } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(onShowInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });
});

describe('CorpTransactionsPanel — filtered to zero', () => {
  it('shows a hint naming which filters to clear', () => {
    renderPanel({ filteredTransactions: [] });

    expect(screen.getByText('No transactions match this filter.')).toBeInTheDocument();
    expect(
      screen.getByText('Clear the search or widen the side and date filters.')
    ).toBeInTheDocument();
  });
});

describe('CorpTransactionsPanel — column picker', () => {
  it('sits in the filter row and hides an optional column, never the item', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Item' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Unit price' }));
    await user.keyboard('{Escape}');

    const table = screen.getByRole('table', { name: 'Transactions' });
    expect(within(table).queryByRole('columnheader', { name: 'Unit price' })).toBeNull();
    expect(within(table).getByRole('columnheader', { name: 'Item' })).toBeInTheDocument();

    // Shared device-local store: put it back for the next test.
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reset to default' }));
  });
});
