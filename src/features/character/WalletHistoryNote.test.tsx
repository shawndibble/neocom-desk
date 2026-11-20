import { DAY_MS } from '@/lib/age';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { WalletHistoryNote } from './WalletHistoryNote';

const NOW = Date.UTC(2026, 9, 16, 12);

describe('WalletHistoryNote', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('renders nothing before the first full fetch', () => {
    const { container } = render(
      <WalletHistoryNote info={{ since: null, gaps: [], unconfirmed: false }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('states the reach and offers no range buttons', () => {
    render(<WalletHistoryNote info={{ since: NOW - 30 * DAY_MS, gaps: [], unconfirmed: false }} />);
    expect(
      screen.getByText(/History since 9\/16\/2026 · kept on this device only\./)
    ).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the gap note', () => {
    render(
      <WalletHistoryNote
        info={{
          since: NOW - 100 * DAY_MS,
          gaps: [[NOW - 60 * DAY_MS, NOW - 30 * DAY_MS]],
          unconfirmed: false,
        }}
      />
    );
    expect(screen.getByText(/Missing: 8\/17\/2026 – 9\/16\/2026/)).toBeVisible();
  });

  it('says coverage is not confirmed when only rows exist', () => {
    render(<WalletHistoryNote info={{ since: null, gaps: [], unconfirmed: true }} />);
    expect(screen.getByText(/don.t know yet how far back/)).toBeVisible();
  });

  it('joins several gaps with a list', () => {
    render(
      <WalletHistoryNote
        info={{
          since: NOW - 100 * DAY_MS,
          gaps: [
            [NOW - 60 * DAY_MS, NOW - 50 * DAY_MS],
            [NOW - 20 * DAY_MS, NOW - 10 * DAY_MS],
          ],
          unconfirmed: false,
        }}
      />
    );
    expect(
      screen.getByText(/8\/17\/2026 – 8\/27\/2026 and 9\/26\/2026 – 10\/6\/2026/)
    ).toBeVisible();
  });
});
