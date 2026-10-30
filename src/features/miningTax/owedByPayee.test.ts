import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { computeOwedByPayee } from './owedByPayee';

const assignment = (over: Partial<MiningTaxAssignmentRecord>) =>
  ({
    id: 'a',
    payeeId: 'p1',
    status: 'outstanding',
    taxOwed: 100,
    ...over,
  }) as MiningTaxAssignmentRecord;

describe('computeOwedByPayee', () => {
  it('sums only Outstanding assignments per Payee', () => {
    const owed = computeOwedByPayee([
      assignment({ id: '1', taxOwed: 100 }),
      assignment({ id: '2', taxOwed: 50 }),
      assignment({ id: '3', status: 'paid', taxOwed: 999 }),
      assignment({ id: '4', payeeId: 'p2', taxOwed: 7 }),
      assignment({ id: '5', payeeId: undefined }),
    ]);
    expect(owed.get('p1')).toMatchObject({ amount: 150, count: 2 });
    expect(owed.get('p2')).toMatchObject({ amount: 7, count: 1 });
    expect(owed.size).toBe(2);
  });

  it('is empty with nothing owed', () => {
    expect(computeOwedByPayee([]).size).toBe(0);
  });
});
