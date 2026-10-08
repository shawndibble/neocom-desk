import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { render, screen } from '@testing-library/react';
import { OwedBalances } from './OwedBalances';
import type { PayeeBalance } from './balances';

const balance = (id: string, owed: number) =>
  ({
    payee: { id, name: `Payee ${id}` },
    owed,
    members: owed > 0 ? [{ assignment: { date: '2026-10-01' } }] : [],
  }) as unknown as PayeeBalance;

function renderBalances(balances: PayeeBalance[]) {
  return render(
    <OwedBalances
      balances={balances}
      unassigned={{ entryCount: 0, estimatedValue: 0 }}
      unlinkedPaymentCount={0}
      isSoleFilter={() => false}
      onFilterPayee={vi.fn()}
      onSettleUp={vi.fn()}
      onLinkPayment={vi.fn()}
      onAssignNext={vi.fn()}
      onReviewPayments={vi.fn()}
    />
  );
}

describe('OwedBalances summary line', () => {
  it('is hidden when exactly one Payee is owed — the card says it all', () => {
    renderBalances([balance('a', 1_000_000)]);
    expect(screen.queryByText(/across/i)).not.toBeInTheDocument();
    expect(screen.queryByText('You owe')).not.toBeInTheDocument();
  });

  it('reads "You owe" in sentence case with the total and payee count for two or more', () => {
    renderBalances([balance('a', 1_000_000), balance('b', 2_000_000)]);
    const label = screen.getByText('You owe');
    expect(label.className).not.toMatch(/uppercase/);
    expect(screen.getByText('across 2 payees')).toBeInTheDocument();
    expect(screen.getByText(/3,000,000 ISK/)).toBeInTheDocument();
  });

  it('says nothing is outstanding when no Payee is owed', () => {
    renderBalances([balance('a', 0)]);
    expect(screen.getByText('You owe')).toBeInTheDocument();
    expect(screen.getByText('Nothing outstanding')).toBeInTheDocument();
  });
});
