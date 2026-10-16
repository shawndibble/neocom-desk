import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { WalletHistoryNote } from './WalletHistoryNote';
import { EMPTY_WALLET_JOURNAL_FILTER } from './walletJournalFilter';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 12);

describe('WalletHistoryNote', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('renders nothing before the first full fetch', () => {
    const { container } = render(
      <WalletHistoryNote
        info={{ since: null, gaps: [], ranges: [], unconfirmed: false }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('states the reach and offers no range the archive has not reached', () => {
    render(
      <WalletHistoryNote
        info={{ since: NOW - 30 * DAY, gaps: [], ranges: [], unconfirmed: false }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(/History since 9\/16\/2026 · kept on this device only\./)
    ).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the reached ranges and the gap note; a range sets the start date', async () => {
    const onChange = vi.fn();
    render(
      <WalletHistoryNote
        info={{
          since: NOW - 100 * DAY,
          gaps: [[NOW - 60 * DAY, NOW - 30 * DAY]],
          ranges: [90],
          unconfirmed: false,
        }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={onChange}
      />
    );
    expect(screen.getByText(/Not recorded: 8\/17\/2026 – 9\/16\/2026/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_WALLET_JOURNAL_FILTER,
      startDate: '2026-07-18',
      endDate: null,
    });
  });

  it('says coverage is not confirmed when only rows exist', () => {
    render(
      <WalletHistoryNote
        info={{ since: null, gaps: [], ranges: [], unconfirmed: true }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={vi.fn()}
      />
    );
    expect(screen.getByText(/not confirmed yet/)).toBeVisible();
  });

  it('joins several gaps with a list', () => {
    render(
      <WalletHistoryNote
        info={{
          since: NOW - 100 * DAY,
          gaps: [
            [NOW - 60 * DAY, NOW - 50 * DAY],
            [NOW - 20 * DAY, NOW - 10 * DAY],
          ],
          ranges: [],
          unconfirmed: false,
        }}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(/8\/17\/2026 – 8\/27\/2026 and 9\/26\/2026 – 10\/6\/2026/)
    ).toBeVisible();
  });
});
