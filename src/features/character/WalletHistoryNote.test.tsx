import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { WalletHistoryNote } from './WalletHistoryNote';
import { EMPTY_WALLET_JOURNAL_FILTER } from './walletJournalFilter';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 12);

describe('WalletHistoryNote', () => {
  it('renders nothing before the first full fetch', () => {
    const { container } = render(
      <WalletHistoryNote
        info={{ since: null, gaps: [], ranges: [] }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={vi.fn()}
        nowMs={NOW}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('states the reach and offers no range the archive has not reached', () => {
    render(
      <WalletHistoryNote
        info={{ since: NOW - 30 * DAY, gaps: [], ranges: [] }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={vi.fn()}
        nowMs={NOW}
      />
    );
    expect(screen.getByText(/History since 2026-09-16 · kept on this device only\./)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the reached ranges and the gap note; a range sets the start date', async () => {
    const onChange = vi.fn();
    render(
      <WalletHistoryNote
        info={{ since: NOW - 100 * DAY, gaps: [[NOW - 60 * DAY, NOW - 30 * DAY]], ranges: [90] }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={onChange}
        nowMs={NOW}
      />
    );
    expect(screen.getByText(/Not recorded: 2026-08-17 – 2026-09-16/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_WALLET_JOURNAL_FILTER,
      startDate: '2026-07-18',
      endDate: null,
    });
  });
});
