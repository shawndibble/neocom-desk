import { describe, expect, it } from 'vitest';
import { payeeLedger } from './payeeLedger';
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

  it('says which payment paid each day, from the account', () => {
    const account = build([
      link(1, 800_000, '2026-10-05'),
      link(2, 700_000, '2026-10-06', { kind: 'contract' }),
    ]);
    expect(account.paidBy('2026-10-01')).toEqual([
      { key: 'journal:1', amount: 800_000 },
      { key: 'contract:2', amount: 200_000 },
    ]);
    expect(account.paidBy('2026-10-02')).toEqual([{ key: 'contract:2', amount: 500_000 }]);
    expect(account.paidBy('2026-10-03')).toEqual([]);
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

  describe('closed-through checkpoint', () => {
    const TODAY = '2026-11-20';

    it('closes through the same date the books close (closedThroughFor)', () => {
      const account = build([link(1, 100_000, '2026-08-20')], [charge('z', '2026-08-10', 300_000)]);
      const stored = account.nextCheckpoint(TODAY, '2026-11-20T00:00:00Z');
      expect(stored?.checkpoint).toMatchObject({
        minerId: 'p1',
        through: '2026-09-30',
        owed: [{ date: '2026-08-10', remaining: 200_000 }],
      });
      // Nothing billed or paid on or before it: nothing to store.
      expect(build([link(1, 1, '2026-10-05')]).nextCheckpoint(TODAY, 'x')).toBeUndefined();
    });

    it('builds from a stored checkpoint the same as from the whole history', () => {
      const old = [charge('z', '2026-08-10', 300_000), ...CHARGES];
      const links = [link(1, 1_200_000, '2026-08-20'), link(2, 2_000_000, '2026-10-05')];
      const whole = PayeeRunningAccount.build({ payeeId: 'p1', charges: old, links });
      const stored = whole.nextCheckpoint(TODAY, '2026-11-20T00:00:00Z')!;
      expect(stored.checkpoint).toMatchObject({ through: '2026-09-30', credit: 900_000 });
      const resumed = PayeeRunningAccount.build({ payeeId: 'p1', charges: old, links, stored });
      expect(resumed.startsFrom).toBe(stored.checkpoint);
      expect(resumed.owes).toEqual(whole.owes);
      expect(resumed.paidThrough).toBe(whole.paidThrough);
      expect(resumed.balance).toBeCloseTo(whole.balance, 6);
      // Already closed: nothing new to store.
      expect(resumed.nextCheckpoint(TODAY, '2026-11-21T00:00:00Z')).toBeUndefined();
    });

    it('trusts a stored checkpoint (a write on or before it drops it), and previews a back-dated payment on the whole history', () => {
      const old = [charge('z', '2026-08-10', 300_000), ...CHARGES];
      const whole = PayeeRunningAccount.build({ payeeId: 'p1', charges: old, links: [] });
      const stored = whole.nextCheckpoint(TODAY, '2026-11-20T00:00:00Z')!;
      const resumed = PayeeRunningAccount.build({ payeeId: 'p1', charges: old, links: [], stored });
      expect(resumed.startsFrom).toBe(stored.checkpoint);
      // A payment from August, before the checkpoint, previews as paying the August day.
      expect(resumed.preview(300_000, '2026-08-12').lines).toContainEqual(
        expect.objectContaining({ date: '2026-08-10', settled: true })
      );
    });

    it('drops a stored checkpoint whose closed history no longer adds up (a write past the app)', () => {
      // A zero-tax day closed paid; then the store is rewritten under the app (an import, a
      // seed) with the same day owing: the checkpoint must not say it is paid.
      const zero = [charge('z', '2026-08-10', 0)];
      const stored = PayeeRunningAccount.build({
        payeeId: 'p1',
        charges: zero,
        links: [],
      }).nextCheckpoint(TODAY, '2026-11-20T00:00:00Z')!;
      const owed = [charge('z', '2026-08-10', 300_000)];
      const resumed = PayeeRunningAccount.build({
        payeeId: 'p1',
        charges: owed,
        links: [],
        stored,
      });
      expect(resumed.startsFrom).toBeUndefined();
      expect(resumed.isPaid('2026-08-10')).toBe(false);
      expect(resumed.owes?.amount).toBe(300_000);
    });

    it('feeds the Payee ledger an opening row for what it closed', () => {
      const old = [charge('z', '2026-08-10', 300_000), ...CHARGES];
      const links = [link(1, 100_000, '2026-08-20')];
      const whole = PayeeRunningAccount.build({ payeeId: 'p1', charges: old, links });
      const stored = whole.nextCheckpoint(TODAY, '2026-11-20T00:00:00Z')!;
      const resumed = PayeeRunningAccount.build({ payeeId: 'p1', charges: old, links, stored });
      const source = resumed.ledgerSource({
        charge: () => ({ kind: 'mined' }),
        payment: (l) => ({ at: `${l.paidOn}T00:00:00Z` }),
      });
      expect(source.opening).toEqual({ through: '2026-09-30', balance: 200_000 });
      const rows = payeeLedger(source).rows;
      expect(rows.map((r) => r.kind)).toEqual(['opening', 'charge', 'charge', 'charge', 'charge']);
      expect(rows.at(-1)!.balance).toBeCloseTo(resumed.balance, 6);
    });
  });
});
