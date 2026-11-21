import { describe, it, expect } from 'vitest';
import type { TaxPayment } from './payments';
import { creditSources, moneyQueue } from './paidBy';

const pay = (
  id: string,
  amount: number,
  at: string,
  extra: Partial<TaxPayment> = {}
): TaxPayment => ({
  id,
  minerId: 'solo:1',
  characterId: 1,
  amount,
  at,
  source: 'donation',
  ...extra,
});

describe('creditSources', () => {
  it('lists the credit that is no payment’s first, then each payment’s leftover oldest first', () => {
    const sources = creditSources(
      [
        pay('p2', 500, '2026-11-02T00:00:00Z', { notTaxAmount: 100 }),
        pay('p1', 1000, '2026-11-01T00:00:00Z'),
      ],
      { paymentCredits: [{ paymentId: 'p1', amount: 300 }], credit: 1500 }
    );
    expect(sources).toEqual([
      { kind: 'credit', amount: 400 },
      { kind: 'payment', paymentId: 'p1', amount: 700 },
      { kind: 'payment', paymentId: 'p2', amount: 400 },
    ]);
  });

  it('leaves out a payment a Statement fully absorbed and a donation before the book', () => {
    const sources = creditSources(
      [pay('p1', 300, '2026-11-01T00:00:00Z'), pay('old', 900, '2026-09-01T00:00:00Z')],
      { paymentCredits: [{ paymentId: 'p1', amount: 300 }], credit: 0 },
      '2026-10-01'
    );
    expect(sources).toEqual([]);
  });
});

describe('moneyQueue', () => {
  const queue = () =>
    moneyQueue([
      { kind: 'credit', amount: 400 },
      { kind: 'payment', paymentId: 'p1', amount: 700 },
      { kind: 'payment', paymentId: 'p2', amount: 400 },
      { kind: 'inFlight', amount: 250, at: '2026-11-05T00:00:00Z', refId: 77 },
    ]);

  it('spends the oldest money first and says whose each slice was', () => {
    const q = queue();
    expect(q.draw(500)).toEqual({
      payments: [{ paymentId: 'p1', amount: 100 }],
      inFlight: [],
      corrections: 400,
    });
    expect(q.draw(1100)).toEqual({
      payments: [
        { paymentId: 'p1', amount: 600 },
        { paymentId: 'p2', amount: 400 },
      ],
      inFlight: [{ amount: 100, at: '2026-11-05T00:00:00Z', refId: 77 }],
    });
  });

  it('lets a mark spend the front of the queue before any day draws', () => {
    const q = queue();
    q.skip(500);
    expect(q.draw(300)).toEqual({ payments: [{ paymentId: 'p1', amount: 300 }], inFlight: [] });
  });

  it('draws only what is left when asked for more', () => {
    const q = queue();
    q.draw(1700);
    expect(q.draw(500)).toEqual({
      payments: [],
      inFlight: [{ amount: 50, at: '2026-11-05T00:00:00Z', refId: 77 }],
    });
  });
});
