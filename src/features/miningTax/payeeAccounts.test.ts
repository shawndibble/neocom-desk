import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import { PayeeAccounts } from './payeeAccounts';

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

describe('PayeeAccounts', () => {
  it('reads Paid off the account: the oldest day first, whichever entry was linked before', () => {
    const accounts = PayeeAccounts.build({
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
    const accounts = PayeeAccounts.build({
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
    const accounts = PayeeAccounts.build({
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
    const accounts = PayeeAccounts.build({
      assignments: [assignment('d', undefined, '2026-10-01', 0, { status: 'dismissed' })],
      payees: [],
      links: [],
    });
    expect(
      accounts.statusOf(assignment('r', 'p1', '2026-10-01', 5, { status: 'needs-review' }))
    ).toBe('needs-review');
    expect(accounts.of('p1')).toBeUndefined();
  });

  it('bills what the caller says is left of an Assignment', () => {
    const accounts = PayeeAccounts.build({
      assignments: [assignment('a', 'p1', '2026-10-01', 100)],
      payees: [payee('p1', 1)],
      links: [link('p1', 40)],
      taxOf: (a) => a.taxOwed * 0.4,
    });
    expect(accounts.paidThroughOf('p1')).toBe('2026-10-01');
  });
});
