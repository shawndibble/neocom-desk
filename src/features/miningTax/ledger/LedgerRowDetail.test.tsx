import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import { LedgerRowDetail } from './LedgerRowDetail';

const paymentRow = (
  payment: Partial<Extract<PayeeLedgerRow, { kind: 'payment' }>['payment']>,
  paid = 4_006_437
): PayeeLedgerRow => ({
  kind: 'payment',
  key: 'payment:x',
  date: '2026-10-12',
  at: '2026-10-12T00:00:00.000Z',
  charged: 0,
  paid,
  balance: 0,
  days: [],
  credit: 0,
  payment: { id: 'x', at: '2026-10-12T00:00:00.000Z', ...payment },
});

const renderDetail = (row: PayeeLedgerRow, onLinkWalletPayment?: () => void) =>
  render(
    <MemoryRouter>
      <LedgerRowDetail row={row} {...(onLinkWalletPayment ? { onLinkWalletPayment } : {})} />
    </MemoryRouter>
  );

describe('LedgerRowDetail: a payment row', () => {
  it('links a wallet payment to its entry, and says who it went to, how much and when', () => {
    renderDetail(
      paymentRow({
        via: 'journal',
        to: 'Plenitude Highsec Police',
        href: '/wallet/journal?highlight=42',
      })
    );
    expect(screen.getByText(/Sent to Plenitude Highsec Police/)).toHaveTextContent(
      '4,006,437 ISK on 2026-10-12'
    );
    expect(screen.getByRole('link', { name: /wallet entry/i })).toHaveAttribute(
      'href',
      '/wallet/journal?highlight=42'
    );
  });

  it('says plainly that a bare mark has no wallet payment, and offers to connect one', async () => {
    const onLink = vi.fn();
    renderDetail(paymentRow({ via: 'marked' }, 0), onLink);
    expect(screen.getByText(/no wallet payment recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /link the wallet payment/i }));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('says a recorded Settle up payment waits for its wallet entry', () => {
    renderDetail(paymentRow({ via: 'recorded' }));
    expect(screen.getByText(/waits for its wallet entry/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
