import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { withStoredMark } from './storedAssignments';

const record = (over: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord => ({
  id: 'a1',
  characterId: 7,
  date: '2026-10-01',
  solarSystemId: 30000142,
  payeeId: 'p1',
  oreLines: [{ typeId: 45490, quantity: 100 }],
  taxPct: 10,
  estimatedValue: 1_000_000,
  taxOwed: 100_000,
  status: 'outstanding',
  updatedAt: 0,
  ...over,
});

describe('a view never reaches a write', () => {
  it('drops a Paid read off the account, and keeps a stored mark exactly', () => {
    expect(withStoredMark(record({ status: 'paid' }), record()).status).toBe('outstanding');
    expect(withStoredMark(record({ status: 'paid' }), undefined).status).toBe('outstanding');
    const mark = record({
      status: 'paid',
      paidAt: 5,
      payment: { paymentId: 'pay1', paidOn: '2026-10-05', method: 'other', amount: 9 },
    });
    // A view of a marked day the account now reads as owed still writes the mark back.
    const viewed = { ...record({ taxOwed: 1 }), status: 'outstanding' as const };
    expect(withStoredMark(viewed, mark)).toMatchObject({
      status: 'paid',
      paidAt: 5,
      payment: mark.payment,
      taxOwed: 1,
    });
  });
});
