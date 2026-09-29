import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { exportRows } from '@/lib/downloadCsv';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CorpTransactionsPanel } from './CorpTransactionsPanel';
import { EMPTY_WALLET_TRANSACTION_FILTER } from '@/features/character/walletTransactionFilter';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';
import type { CorporationWalletTransaction } from '@/esi/endpoints';

vi.mock('@/lib/downloadCsv', () => ({ exportRows: vi.fn().mockResolvedValue(undefined) }));

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
  const actions = fakeItemActions();
  const txns = [transaction()];
  render(
    withItemActions(
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
          {...overrides}
        />
      </MemoryRouter>,
      actions
    )
  );
  return { actions };
}

describe('CorpTransactionsPanel — the row as an item', () => {
  it('opens the same menu from a visible More actions button on the row (#1497)', async () => {
    const user = userEvent.setup();
    const { actions } = renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'More actions for Damage Control II' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Show info' }));

    expect(actions.showInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  it('carries the item context menu on every row', async () => {
    const { actions } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(actions.showInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
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

  it('offers "Reset filters" when a filter is active and resets it on click', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    renderPanel({
      filteredTransactions: [],
      filter: { ...EMPTY_WALLET_TRANSACTION_FILTER, side: 'buy' },
      onFilterChange,
    });

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_WALLET_TRANSACTION_FILTER);
  });

  it('omits "Reset filters" when no filter is active', () => {
    renderPanel({ filteredTransactions: [] });

    expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();
  });
});

describe('CorpTransactionsPanel — export', () => {
  it("exports the filtered rows from the panel's ⋯ menu, named for the division", async () => {
    const user = userEvent.setup();
    const older = transaction({ transaction_id: 1, date: '2026-09-01T00:00:00Z' });
    const newer = transaction({ transaction_id: 2, date: '2026-09-02T00:00:00Z' });
    renderPanel({
      transactions: [older, newer],
      filteredTransactions: [older, newer],
      divisionQualifier: 'SRP',
      transactionsResult: {
        data: [older, newer],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: true,
      },
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Transactions actions' }), {
      button: 0,
      pointerType: 'mouse',
    });
    (await screen.findByRole('menuitem', { name: 'Export table' })).focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(exportRows).toHaveBeenCalledOnce());
    const [format, surface, rows, , options] = vi.mocked(exportRows).mock.calls[0];
    expect(format).toBe('csv');
    expect(surface).toBe('corp-wallet-transactions');
    // The table's own order — newest first under its date-desc sort.
    expect((rows as CorporationWalletTransaction[]).map((r) => r.transaction_id)).toEqual([2, 1]);
    expect(options).toEqual({ truncated: true, qualifier: 'SRP' });
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
