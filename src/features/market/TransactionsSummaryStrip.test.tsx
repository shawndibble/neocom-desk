import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionsSummaryStrip } from './TransactionsSummaryStrip';
import type { WalletTransaction } from '@/esi/endpoints';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
  }),
}));

const fill = (id: number, date: string): WalletTransaction => ({
  transaction_id: id,
  date,
  location_id: 1,
  type_id: 34,
  unit_price: 5,
  quantity: 1,
  client_id: 1,
  is_buy: false,
  is_personal: true,
  journal_ref_id: id,
});
const FILLS = [fill(1, '2026-10-05T23:30:00Z'), fill(2, '2026-10-20T01:00:00Z')];

describe('TransactionsSummaryStrip range line', () => {
  it('shows no range while the filter has no dates', () => {
    render(
      <TransactionsSummaryStrip transactions={FILLS} range={{ startDate: null, endDate: null }} />
    );
    expect(screen.queryByText(/transactionsRange/)).toBeNull();
  });

  it('shows the filter start and end, filling a missing side from the fills in UTC', () => {
    render(
      <TransactionsSummaryStrip
        transactions={FILLS}
        range={{ startDate: '2026-10-01', endDate: null }}
      />
    );
    const text = screen.getByText(/transactionsRange/).textContent ?? '';
    expect(text).toContain('"from":"10/1/2026"');
    // The newest fill is 2026-10-20 01:00 UTC; the UTC day, whatever the local zone.
    expect(text).toContain('"to":"10/20/2026"');
  });
});
