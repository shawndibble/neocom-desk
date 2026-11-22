import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { withoutPaidMark } from './storedAssignments';

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
  it('drops a Paid read off the account, and any old mark', () => {
    const written = withoutPaidMark(
      record({
        status: 'paid',
        paidAt: 5,
        payment: { paymentId: 'pay1', paidOn: '2026-10-05', method: 'other', amount: 9 },
      })
    );
    expect(written.status).toBe('outstanding');
    expect(written).not.toHaveProperty('paidAt');
    expect(written).not.toHaveProperty('payment');
    expect(withoutPaidMark(record({ status: 'dismissed' })).status).toBe('dismissed');
  });
});
