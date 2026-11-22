import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { PayeeRunningAccounts } from './payeeRunningAccounts';

const payee = (id: string, characterId: number, entityId?: number): PayeeRecord => ({
  id,
  characterId,
  name: 'Brass Meridian',
  defaultTaxPct: 10,
  ...(entityId !== undefined ? { entityId, entityKind: 'corporation' as const } : {}),
  updatedAt: 0,
});

const assignment = (
  id: string,
  payeeId: string | undefined,
  date: string,
  taxOwed: number,
  over: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord => ({
  id,
  characterId: 1,
  date,
  solarSystemId: 30000142,
  ...(payeeId ? { payeeId } : {}),
  oreLines: [],
  taxPct: 10,
  estimatedValue: taxOwed * 10,
  taxOwed,
  status: 'outstanding',
  updatedAt: 0,
  ...over,
});

const link = (payeeId: string, amount: number, refId = 1): PayeePaymentLink => ({
  payeeId,
  kind: 'journal',
  refId,
  amount,
  paidOn: '2026-10-10',
  source: 'manual',
});

describe('PayeeRunningAccounts', () => {
  it('reads Paid off the account: the oldest day first, whichever entry was linked before', () => {
    const accounts = PayeeRunningAccounts.build({
      assignments: [
        assignment('a', 'p1', '2026-10-01', 100),
        assignment('b', 'p1', '2026-10-02', 100),
      ],
      payees: [payee('p1', 1)],
      links: [link('p1', 100)],
    });
    expect(accounts.statusOf(assignment('a', 'p1', '2026-10-01', 100))).toBe('paid');
    expect(accounts.statusOf(assignment('b', 'p1', '2026-10-02', 100))).toBe('outstanding');
    expect(accounts.paidThroughOf('p1')).toBe('2026-10-01');
  });

  it('is one account for a merged Payee: an alt’s payment pays the group’s oldest day', () => {
    const accounts = PayeeRunningAccounts.build({
      assignments: [
        assignment('a', 'p1', '2026-10-01', 100),
        assignment('b', 'p2', '2026-10-02', 100),
      ],
      payees: [payee('p1', 1, 98000001), payee('p2', 2, 98000001)],
      links: [link('p2', 150)],
    });
    expect(accounts.of('p2')).toBe(accounts.of('p1'));
    expect(accounts.isPaid(assignment('a', 'p1', '2026-10-01', 100))).toBe(true);
    expect(accounts.of('p1')?.owedOf({ date: '2026-10-02', tax: 100 })).toBe(50);
  });

  it('reads a legacy paid mark as billed: only a link pays it', () => {
    const marked = assignment('a', 'p1', '2026-10-01', 100, {
      status: 'paid',
      paidAt: 1,
      payment: { paymentId: 'x', paidOn: '2026-10-02', method: 'other', amount: 100 },
    });
    const accounts = PayeeRunningAccounts.build({
      assignments: [marked],
      payees: [payee('p1', 1)],
      links: [],
    });
    expect(accounts.statusOf(marked)).toBe('outstanding');
    const view = accounts.view(marked);
    expect(view.status).toBe('outstanding');
    expect(view.payment).toBeUndefined();
    expect(view.paidAt).toBeUndefined();
  });

  it('leaves a review and a dismissal as they are, and bills neither a dismissal', () => {
    const accounts = PayeeRunningAccounts.build({
      assignments: [assignment('d', undefined, '2026-10-01', 0, { status: 'dismissed' })],
      payees: [],
      links: [],
    });
    expect(
      accounts.statusOf(assignment('r', 'p1', '2026-10-01', 5, { status: 'needs-review' }))
    ).toBe('needs-review');
    expect(accounts.of('p1')).toBeUndefined();
  });

  it('bills only what is left once a Corp Tax Book bills part of an Assignment too', () => {
    const accounts = PayeeRunningAccounts.build({
      assignments: [assignment('a', 'p1', '2026-10-01', 100)],
      payees: [payee('p1', 1)],
      links: [link('p1', 40)],
      billedElsewhere: new Map([['a', 0.6]]),
    });
    expect(accounts.paidThroughOf('p1')).toBe('2026-10-01');
  });

  // An Assignment a Corp Tax Book bills whole (the corporation's own Payee's days the book took)
  // is no charge of its Payee: neither owed nor a zero line in its ledger.
  it('leaves a day billed elsewhere in full off the account, and the money to pay the rest', () => {
    const accounts = PayeeRunningAccounts.build({
      assignments: [
        assignment('old', 'p1', '2026-10-01', 100),
        assignment('booked', 'p1', '2026-10-02', 100),
      ],
      payees: [payee('p1', 1)],
      links: [link('p1', 60)],
      billedElsewhere: new Map([['booked', 1]]),
    });
    const account = accounts.of('p1')!;
    expect(account.charges.map((c) => c.id)).toEqual(['old']);
    expect(account.owes?.amount).toBe(40);
  });

  describe('a Payee a Corp Tax Book is the authority for', () => {
    const build = () =>
      PayeeRunningAccounts.build({
        assignments: [
          assignment('a', 'p1', '2026-10-01', 100),
          assignment('b', 'p2', '2026-10-02', 100),
          assignment('c', 'q', '2026-10-02', 70),
        ],
        payees: [payee('p1', 1, 98000001), payee('p2', 2, 98000001), payee('q', 1, 5)],
        links: [link('p1', 500, 7)],
        bookOwned: new Set(['p2']),
      });

    it('has no account that counts: no debt, no credit, never offered a payment', () => {
      const accounts = build();
      // p2's record makes the whole merged Payee the book's, whichever record a caller asks by.
      expect(accounts.isBookOwned('p1')).toBe(true);
      expect(accounts.of('p1')).toBeUndefined();
      expect([...accounts.entries()].map(([id]) => id)).toEqual(['q']);
      expect(
        accounts.linkable([payee('p1', 1, 98000001), payee('q', 1, 5)]).map((p) => p.id)
      ).toEqual(['q']);
    });

    it('keeps its old history, read-only, with the credit it would have shown counting nowhere', () => {
      const accounts = build();
      expect(accounts.historyOf('p2')?.credit).toBe(300);
      expect(accounts.of('q')?.owes?.amount).toBe(70);
    });
  });

  describe('an archived Payee', () => {
    const ARCHIVED = Date.UTC(2026, 9, 10);
    const archivedPayee = (id: string, characterId: number) => ({
      ...payee(id, characterId, 98000001),
      archivedAt: ARCHIVED,
    });

    it('has no card, and its credit and Settle up count nowhere, while nothing new is billed', () => {
      const accounts = PayeeRunningAccounts.build({
        assignments: [assignment('a', 'p1', '2026-10-01', 100)],
        payees: [archivedPayee('p1', 1), payee('q', 1, 5)],
        links: [link('p1', 500, 3)],
      });
      expect(accounts.isArchived('p1')).toBe(true);
      expect(accounts.of('p1')?.credit).toBe(400);
      expect(
        accounts.linkable([archivedPayee('p1', 1), payee('q', 1, 5)]).map((p) => p.id)
      ).toEqual(['q']);
    });

    it('shows again, by itself, once a day after it was archived is billed', () => {
      const accounts = PayeeRunningAccounts.build({
        assignments: [
          assignment('a', 'p1', '2026-10-01', 100),
          assignment('b', 'p1', '2026-10-11', 100),
        ],
        payees: [archivedPayee('p1', 1)],
        links: [link('p1', 100, 3)],
      });
      expect(accounts.isArchived('p1')).toBe(false);
    });

    it('is archived only when every record of a merged Payee is', () => {
      const accounts = PayeeRunningAccounts.build({
        assignments: [assignment('a', 'p1', '2026-10-01', 100)],
        payees: [archivedPayee('p1', 1), payee('p2', 2, 98000001)],
        links: [link('p1', 100, 3)],
      });
      expect(accounts.isArchived('p2')).toBe(false);
    });
  });
});
