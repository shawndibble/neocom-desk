import { describe, expect, it } from 'vitest';
import {
  PayeeRunningAccount,
  heldPaymentKeys,
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
  describe('a bare "Mark paid" (a legacy link with no payment behind it)', () => {
    const DAYS = [charge('m1', '2026-10-01', 1_000), charge('m2', '2026-10-02', 1_000)];
    const mark = (id: string, amount = 1_000): PayeePaymentLink =>
      link(`mark:${id}`, amount, '2026-10-03', { kind: 'legacy' });
    const buildMarked = (links: PayeePaymentLink[], charges = DAYS) =>
      PayeeRunningAccount.build({ payeeId: 'p1', charges, links });

    it('settles only its own day, and is no money', () => {
      const account = buildMarked([mark('m2')]);
      expect(account.isPaid('2026-10-02')).toBe(true);
      expect(account.isPaid('2026-10-01')).toBe(false);
      expect(account.owes).toEqual({ amount: 1_000, days: 1, oldest: '2026-10-01' });
      expect(account.credit).toBe(0);
      expect(account.marked).toEqual([{ id: 'legacy:mark:m2', date: '2026-10-02', amount: 1_000 }]);
    });

    it('does not double-pay a day the pilot marked and then linked the real payment of', () => {
      const account = buildMarked([mark('m1'), mark('m2'), link(9, 2_000, '2026-10-04')]);
      expect(account.owes).toBeNull();
      expect(account.credit).toBe(0);
      expect(account.balance).toBe(0);
      expect(account.marked.map((m) => m.amount)).toEqual([0, 0]);
    });

    it('settles a marked day real money did not reach, and never pays another day', () => {
      const account = buildMarked([mark('m2'), link(9, 1_000, '2026-10-04')]);
      expect(account.owes).toBeNull();
      expect(account.credit).toBe(0);
      expect(account.marked).toEqual([{ id: 'legacy:mark:m2', date: '2026-10-02', amount: 1_000 }]);
    });

    it('settles only what real money left of the day, and keeps the other day owed', () => {
      const account = buildMarked([mark('m1'), link(9, 1_500, '2026-10-04')]);
      expect(account.owes).toEqual({ amount: 500, days: 1, oldest: '2026-10-02' });
      expect(account.credit).toBe(0);
      expect(account.marked[0]!.amount).toBe(0);
    });

    it('settles no more than the mark said, nor than the day is worth', () => {
      const account = buildMarked([mark('m1', 400)]);
      expect(account.owes?.amount).toBe(1_600);
      expect(account.marked[0]!.amount).toBe(400);
    });

    it('marks nothing for a day that is no longer billed', () => {
      const account = buildMarked([mark('gone')]);
      expect(account.credit).toBe(0);
      expect(account.owes?.amount).toBe(2_000);
      expect(account.marked).toEqual([{ id: 'legacy:mark:gone', date: null, amount: 0 }]);
    });

    it('previews a payment the way recording it would pay: real money first', () => {
      const account = buildMarked([mark('m1')]);
      const preview = account.preview(1_000, '2026-10-05');
      expect(preview.lines.map((l) => [l.date, l.applied])).toEqual([['2026-10-01', 1_000]]);
      const recorded = buildMarked([mark('m1'), link(9, 1_000, '2026-10-05')]);
      expect(preview.owedAfter).toBe(recorded.owes?.amount ?? 0);
      expect(preview.owedAfter).toBe(1_000);
      expect(preview.creditAfter).toBe(recorded.credit);
    });

    it('still counts a legacy link carrying a real payment as money', () => {
      const account = buildMarked([
        link('pay-1', 2_000, '2026-10-03', {
          kind: 'legacy',
          refs: [{ kind: 'journal', refId: 77 }],
        }),
      ]);
      expect(account.owes).toBeNull();
      expect(account.marked).toEqual([]);
    });

    it("holds a legacy link's journal entry, so it is never counted a second time as a new link", () => {
      const legacy = link('pay-1', 2_000, '2026-10-03', {
        kind: 'legacy',
        refs: [{ kind: 'journal', refId: 77 }],
      });
      const held = heldPaymentKeys([legacy]);
      expect(held.has(paymentLinkKey({ kind: 'journal', refId: 77 }))).toBe(true);
    });
  });
});
