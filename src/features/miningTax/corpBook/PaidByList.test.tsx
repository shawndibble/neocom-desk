import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { TaxPayment } from '@/engine/corpTaxBook/payments';
import type { PaidBy } from '@/engine/corpTaxBook/personal';
import { PaidByList } from './PaidByList';

const payment = (over: Partial<TaxPayment>): TaxPayment => ({
  id: 'p1',
  minerId: 'solo:1',
  characterId: 90000001,
  amount: 1_000_000,
  at: '2026-10-18T13:10:00Z',
  source: 'donation',
  ...over,
});

function renderList(
  paidBy: PaidBy,
  payments: TaxPayment[] = [],
  walletRefs?: ReadonlyMap<string, number>,
  corpName = 'Brass Meridian'
) {
  render(
    <MemoryRouter>
      <PaidByList
        paidBy={paidBy}
        payments={payments}
        corpName={corpName}
        {...(walletRefs ? { walletRefs } : {})}
      />
    </MemoryRouter>
  );
}

describe('PaidByList', () => {
  it("shows an officer's note beside the payment they recorded by hand", () => {
    renderList({ payments: [{ paymentId: 'p1', amount: 1_000_000 }], inFlight: [] }, [
      payment({ source: 'manual', note: 'Handed over in person' }),
    ]);
    expect(screen.getByRole('listitem')).toHaveTextContent('Handed over in person');
  });

  it('lists each payment with what it put on the day, its kind and when', () => {
    renderList(
      {
        payments: [
          { paymentId: 'p1', amount: 600_000 },
          { paymentId: 'p2', amount: 150_000 },
        ],
        inFlight: [],
      },
      [payment({ id: 'p1' }), payment({ id: 'p2', source: 'manual', at: '2026-10-19T08:00:00Z' })]
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Donation/);
    expect(items[0]).toHaveTextContent('600,000 ISK');
    expect(items[1]).toHaveTextContent(/Recorded by an officer/);
    expect(items[1]).toHaveTextContent('150,000 ISK');
  });

  it('names a donation the corporation has not credited yet', () => {
    renderList({
      payments: [],
      inFlight: [{ amount: 222_000, at: '2026-10-18T13:10:00Z', refId: 5150 }],
    });
    expect(screen.getByText(/not credited by Brass Meridian yet/)).toBeInTheDocument();
    expect(screen.getByText('222,000 ISK')).toBeInTheDocument();
  });

  it('keeps credit from corrections apart from the payments, and does not call it one', () => {
    renderList(
      {
        payments: [{ paymentId: 'p1', amount: 100_000 }],
        inFlight: [],
        corrections: 40_000,
      },
      [payment({ id: 'p1' })]
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/not a payment/i)).toBeInTheDocument();
    expect(screen.getByText('40,000 ISK')).toBeInTheDocument();
  });

  it('lists what an officer forgave apart from the payments', () => {
    renderList(
      {
        payments: [{ paymentId: 'p1', amount: 100_000 }],
        inFlight: [],
        writtenOff: 25_000,
      },
      [payment({ id: 'p1' })]
    );
    expect(screen.getByText(/forgiven by an officer \(not a payment\)/i)).toBeInTheDocument();
    expect(screen.getByText('25,000 ISK')).toBeInTheDocument();
  });

  it('shows a payment the book has not loaded by its amount alone', () => {
    renderList({ payments: [{ paymentId: 'gone', amount: 75_000 }], inFlight: [] });
    expect(screen.getByText('75,000 ISK')).toBeInTheDocument();
  });

  it('links a payment to the member’s own wallet entry when one was found, and only then', () => {
    renderList(
      {
        payments: [
          { paymentId: 'p1', amount: 600_000 },
          { paymentId: 'p2', amount: 150_000 },
        ],
        inFlight: [],
      },
      [payment({ id: 'p1' }), payment({ id: 'p2' })],
      new Map([['p1', 5150]])
    );
    const links = screen.getAllByRole('link', { name: 'Open in wallet' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/wallet/journal?highlight=5150');
    expect(within(links[0]!.closest('li')!).getByText('600,000 ISK')).toBeInTheDocument();
  });

  it('is read-only: no links and no buttons', () => {
    renderList({ payments: [{ paymentId: 'p1', amount: 1 }], inFlight: [] }, [
      payment({ id: 'p1' }),
    ]);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
