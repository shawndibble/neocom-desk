import { describe, expect, it } from 'vitest';
import {
  PayeeRunningAccount,
  paymentLinkKey,
  type PayeeCharge,
  type PayeePaymentLink,
} from './payeeRunningAccount';

const charge = (id: string, date: string, tax: number): PayeeCharge => ({ id, date, tax });
const link = (
  refId: number | string,
  amount: number,
  paidOn: string,
  over: Partial<PayeePaymentLink> = {}
): PayeePaymentLink => ({
  payeeId: 'p1',
  kind: 'journal',
  refId,
  amount,
  paidOn,
  source: 'manual',
  ...over,
});

const CHARGES = [
  charge('a', '2026-10-01', 600_000),
  charge('b', '2026-10-01', 400_000),
  charge('c', '2026-10-02', 2_000_000),
  charge('d', '2026-10-03', 500_000),
];

const build = (links: PayeePaymentLink[], charges = CHARGES) =>
  PayeeRunningAccount.build({ payeeId: 'p1', charges, links });

describe('PayeeRunningAccount', () => {
  it('pays the oldest day first, whatever entry the pilot had in mind', () => {
    const account = build([link(1, 1_000_000, '2026-10-05')]);
    expect(account.isPaid('2026-10-01')).toBe(true);
    expect(account.isPaid('2026-10-02')).toBe(false);
    expect(account.paidThrough).toBe('2026-10-01');
    expect(account.owes).toEqual({ amount: 2_500_000, days: 2, oldest: '2026-10-02' });
  });

  it('part-pays the next day: its entries owe their share of what is left', () => {
    const account = build([link(1, 1_500_000, '2026-10-05')]);
    expect(account.owedOf(CHARGES[2])).toBe(1_500_000);
    expect(account.owedOf(CHARGES[0])).toBe(0);
  });

  it('keeps what is over as credit', () => {
    const account = build([link(1, 4_000_000, '2026-10-05')]);
    expect(account.owes).toBeNull();
    expect(account.credit).toBe(500_000);
    expect(account.paidThrough).toBe('2026-10-03');
  });

  it('forgives a shortfall within the tolerance on a day money reached', () => {
    const account = build([link(1, 997_000, '2026-10-05')]);
    expect(account.isPaid('2026-10-01')).toBe(true);
  });

  it('previews one more payment without recording it', () => {
    const account = build([link(1, 1_000_000, '2026-10-05')]);
    const preview = account.preview(2_600_000, '2026-10-07');
    expect(preview.lines.map((l) => [l.date, l.applied, l.settled])).toEqual([
      ['2026-10-02', 2_000_000, true],
      ['2026-10-03', 500_000, true],
    ]);
    expect(preview.creditAdded).toBe(100_000);
    expect(account.owes?.amount).toBe(2_500_000);
  });

  it('bills nothing with no charges, and reads nothing paid', () => {
    const account = build([], []);
    expect(account.owes).toBeNull();
    expect(account.paidThrough).toBeNull();
  });

  it('keys a link by what was paid, so one Made Payment can only be linked once', () => {
    expect(paymentLinkKey({ kind: 'journal', refId: 7 })).toBe('journal:7');
    expect(paymentLinkKey({ kind: 'recorded', refId: 'abc' })).toBe('recorded:abc');
  });
});
