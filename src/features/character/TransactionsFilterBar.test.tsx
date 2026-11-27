import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { stubViewport } from '@/test/viewport';
import { TransactionsFilterBar } from './TransactionsFilterBar';
import { EMPTY_WALLET_TRANSACTION_FILTER } from './walletTransactionFilter';

describe('TransactionsFilterBar', () => {
  it('passes the search text up, keeping the rest of the filter', () => {
    const onChange = vi.fn();
    render(
      <TransactionsFilterBar
        filter={{ ...EMPTY_WALLET_TRANSACTION_FILTER, side: 'buy' }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Search item…'), {
      target: { value: 'Tritanium' },
    });
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_WALLET_TRANSACTION_FILTER,
      side: 'buy',
      text: 'Tritanium',
    });
  });

  it('renders the caller’s actions in the row', () => {
    render(
      <TransactionsFilterBar
        filter={EMPTY_WALLET_TRANSACTION_FILTER}
        onChange={vi.fn()}
        actions={<button type="button">Columns</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();
  });

  it('offers Side and dates, and a Stations pick only when stations are passed', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <TransactionsFilterBar filter={EMPTY_WALLET_TRANSACTION_FILTER} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByRole('combobox', { name: 'Side' })).toBeInTheDocument();
    expect(screen.queryByText(/stations/i)).not.toBeInTheDocument();
    unmount();

    render(
      <TransactionsFilterBar
        filter={EMPTY_WALLET_TRANSACTION_FILTER}
        onChange={vi.fn()}
        stationOptions={[{ id: 60003760, label: 'Jita IV - Moon 4' }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect((await screen.findAllByText(/stations/i)).length).toBeGreaterThan(0);
  });

  it('shows the view switch in the row, and in the filter sheet on a phone', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <TransactionsFilterBar filter={EMPTY_WALLET_TRANSACTION_FILTER} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getAllByRole('button', { name: 'By station' })).toHaveLength(1);
    unmount();

    const restore = stubViewport(NARROW_QUERY);
    try {
      render(<TransactionsFilterBar filter={EMPTY_WALLET_TRANSACTION_FILTER} onChange={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'By station' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Filters' }));
      expect(await screen.findByRole('button', { name: 'By station' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
