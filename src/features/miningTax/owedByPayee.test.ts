import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { computeOwedByPayee } from './owedByPayee';
import { PayeeAccounts } from './payeeAccounts';

const assignment = (over: Partial<MiningTaxAssignmentRecord>) =>
  ({
    id: 'a',
    payeeId: 'p1',
    date: '2026-10-01',
    status: 'outstanding',
    taxOwed: 100,
    ...over,
  }) as MiningTaxAssignmentRecord;

const accountsOf = (assignments: MiningTaxAssignmentRecord[], paid = 0) =>
  PayeeAccounts.build({
    assignments,
    payees: [],
    links:
      paid > 0
        ? [
            {
              payeeId: 'p1',
              kind: 'journal',
              refId: 1,
              amount: paid,
              paidOn: '2026-10-10',
              source: 'manual',
            },
          ]
        : [],
  });

describe('computeOwedByPayee', () => {
  it("sums what each Outstanding Assignment still owes of its Payee's account", () => {
    const all = [
      assignment({ id: '1', taxOwed: 100 }),
      assignment({ id: '2', taxOwed: 50, date: '2026-10-02' }),
      assignment({ id: '4', payeeId: 'p2', taxOwed: 7 }),
      assignment({ id: '5', payeeId: undefined }),
    ];
    const owed = computeOwedByPayee(all, accountsOf(all, 40));
    expect(owed.get('p1')).toMatchObject({ amount: 110, count: 2 });
    expect(owed.get('p2')).toMatchObject({ amount: 7, count: 1 });
    expect(owed.size).toBe(2);
  });

  it('leaves out an Assignment whose day is paid', () => {
    const all = [assignment({ id: '1' }), assignment({ id: '2', date: '2026-10-02' })];
    const owed = computeOwedByPayee(
      all.map((a) => accountsOf(all, 100).view(a)),
      accountsOf(all, 100)
    );
    expect(owed.get('p1')).toMatchObject({ amount: 100, count: 1 });
  });

  it('is empty with nothing owed', () => {
    expect(computeOwedByPayee([], accountsOf([])).size).toBe(0);
  });
});
