import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { ratesForPayee } from './payeeRates';

function a(over: Partial<MiningTaxAssignmentRecord>): MiningTaxAssignmentRecord {
  return {
    id: 'x',
    characterId: 1,
    date: '2026-09-01',
    solarSystemId: 1,
    payeeId: 'p1',
    oreLines: [],
    taxPct: 5,
    estimatedValue: 0,
    taxOwed: 0,
    status: 'outstanding',
    updatedAt: 1,
    ...over,
  };
}

describe('ratesForPayee', () => {
  it('lists the distinct rates used with the Payee, plus the default, ascending', () => {
    const rows = [a({ taxPct: 8 }), a({ taxPct: 5 }), a({ taxPct: 8 })];
    expect(ratesForPayee(rows, 'p1', 10)).toEqual([5, 8, 10]);
  });

  it('does not repeat the default when it was also used', () => {
    expect(ratesForPayee([a({ taxPct: 10 })], 'p1', 10)).toEqual([10]);
  });

  it('ignores other Payees, dismissed and unassigned entries', () => {
    const rows = [
      a({ payeeId: 'p2', taxPct: 3 }),
      a({ status: 'dismissed', taxPct: 4 }),
      a({ payeeId: undefined, taxPct: 6 }),
    ];
    expect(ratesForPayee(rows, 'p1', 7)).toEqual([7]);
  });
});
