import { describe, expect, it } from 'vitest';
import { MinerRunningAccount } from '../corpTaxBook/minerRunningAccount';
import type { TaxPayment } from '../corpTaxBook/payments';
import {
  assignmentRecordChange,
  planBookToleranceRecordChanges,
  planToleranceRecordChanges,
  recordChangesForBook,
  recordChangesForPayee,
  toleranceRecordChangeId,
  type RecordChange,
  type AssignmentTerms,
} from './recordChanges';

const payment = (id: string, amount: number, at: string): TaxPayment => ({
  id,
  minerId: 'm1',
  characterId: 1,
  amount,
  at,
  source: 'donation',
});

function plan(
  days: { date: string; tax: number }[],
  payments: TaxPayment[],
  more: { dayTolerancePct?: number; existing?: ReadonlySet<string> } = {}
) {
  const account = MinerRunningAccount.build({
    days,
    payments,
    ...(more.dayTolerancePct !== undefined ? { dayTolerancePct: more.dayTolerancePct } : {}),
  });
  return planToleranceRecordChanges({
    corporationId: 98000001,
    minerId: 'm1',
    account,
    payments,
    existingIds: more.existing ?? new Set(),
  });
}

describe('planToleranceRecordChanges', () => {
  it('records a day paid within the default tolerance as one tolerance close-out', () => {
    const changes = plan(
      [{ date: '2026-11-01', tax: 1_000_000 }],
      [payment('p1', 996_000, '2026-11-02T10:00:00Z')]
    );
    expect(changes).toEqual([
      {
        id: toleranceRecordChangeId(98000001, 'm1', '2026-11-01'),
        reason: 'tolerance',
        at: '2026-11-02T10:00:00Z',
        date: '2026-11-01',
        corporationId: 98000001,
        minerId: 'm1',
        closeOut: {
          billed: 1_000_000,
          paid: 996_000,
          writtenOff: 4_000,
          tolerancePct: 0.5,
          paymentId: 'p1',
        },
      },
    ]);
  });

  it('records nothing when the shortfall is outside the tolerance, and the day still owes the rest', () => {
    const days = [{ date: '2026-11-01', tax: 1_000_000 }];
    const payments = [payment('p1', 990_000, '2026-11-02T10:00:00Z')];
    expect(plan(days, payments)).toEqual([]);
    const account = MinerRunningAccount.build({ days, payments });
    expect(account.owes).toEqual({ amount: 10_000, days: 1, oldest: '2026-11-01' });
  });

  it("uses the book's own tolerance setting", () => {
    const days = [{ date: '2026-11-01', tax: 1_000_000 }];
    const payments = [payment('p1', 990_000, '2026-11-02T10:00:00Z')];
    const [change] = plan(days, payments, { dayTolerancePct: 2 });
    expect(change).toMatchObject({
      closeOut: { writtenOff: 10_000, paid: 990_000, tolerancePct: 2 },
    });
  });

  it('records nothing for a day paid in full or not paid at all', () => {
    expect(
      plan(
        [
          { date: '2026-11-01', tax: 1_000_000 },
          { date: '2026-11-02', tax: 1_000_000 },
        ],
        [payment('p1', 1_000_000, '2026-11-02T10:00:00Z')]
      )
    ).toEqual([]);
  });

  it('never plans a second close-out for a day already recorded', () => {
    const days = [
      { date: '2026-11-01', tax: 1_000_000 },
      { date: '2026-11-02', tax: 2_000_000 },
    ];
    const payments = [
      payment('p1', 1_000_000, '2026-11-02T10:00:00Z'),
      payment('p2', 1_995_000, '2026-11-03T10:00:00Z'),
    ];
    const first = plan(days, payments);
    expect(first.map((c) => [c.date, c.closeOut.paymentId])).toEqual([['2026-11-02', 'p2']]);
    expect(
      plan(days, payments, { existing: new Set(['tolerance:98000001:m1:2026-11-01']) })
    ).toEqual(first);
    expect(plan(days, payments, { existing: new Set(first.map((c) => c.id)) })).toEqual([]);
  });

  it('keys a close-out by corporation, miner and day', () => {
    expect(toleranceRecordChangeId(98000001, 'm1', '2026-11-01')).toBe(
      'tolerance:98000001:m1:2026-11-01'
    );
  });
});

const terms = (over: Partial<AssignmentTerms> = {}): AssignmentTerms => ({
  payeeId: 'payee-1',
  taxPct: 10,
  taxOwed: 1_000,
  oreLines: [{ typeId: 45490, quantity: 100 }],
  ...over,
});

describe('assignmentRecordChange', () => {
  it('holds every changed Assignment with its terms before and after', () => {
    const change = assignmentRecordChange({
      id: 'c1',
      reason: 'autoFix',
      at: '2026-11-03T00:00:00Z',
      date: '2026-11-02',
      corporationId: 98000001,
      assignments: [
        { assignmentId: 'a1', before: terms(), after: terms({ taxPct: 8, taxOwed: 800 }) },
        { assignmentId: 'a2', before: null, after: terms({ payeeId: 'payee-2' }) },
        { assignmentId: 'a3', before: terms(), after: null },
      ],
    });
    expect(change).toEqual({
      id: 'c1',
      reason: 'autoFix',
      at: '2026-11-03T00:00:00Z',
      date: '2026-11-02',
      corporationId: 98000001,
      assignments: [
        { assignmentId: 'a1', before: terms(), after: terms({ taxPct: 8, taxOwed: 800 }) },
        { assignmentId: 'a2', before: null, after: terms({ payeeId: 'payee-2' }) },
        { assignmentId: 'a3', before: terms(), after: null },
      ],
    });
  });

  it('drops Assignments whose terms did not change, and returns nothing when none did', () => {
    const same = assignmentRecordChange({
      id: 'c1',
      reason: 'fixMyRecords',
      at: '2026-11-03T00:00:00Z',
      date: '2026-11-02',
      assignments: [
        {
          assignmentId: 'a1',
          before: terms(),
          after: terms({ oreLines: [{ typeId: 45490, quantity: 100 }] }),
        },
      ],
    });
    expect(same).toBeNull();
    const one = assignmentRecordChange({
      id: 'c2',
      reason: 'autoAssign',
      at: '2026-11-03T00:00:00Z',
      date: '2026-11-02',
      assignments: [
        { assignmentId: 'a1', before: terms(), after: terms() },
        {
          assignmentId: 'a2',
          before: terms(),
          after: terms({ oreLines: [{ typeId: 45490, quantity: 120 }] }),
        },
      ],
    });
    expect(one?.assignments.map((a) => a.assignmentId)).toEqual(['a2']);
  });

  it('treats ore lines in a different order as unchanged', () => {
    const lines = [
      { typeId: 1, quantity: 5 },
      { typeId: 2, quantity: 6 },
    ];
    expect(
      assignmentRecordChange({
        id: 'c1',
        reason: 'autoFix',
        at: '2026-11-03T00:00:00Z',
        date: '2026-11-02',
        assignments: [
          {
            assignmentId: 'a1',
            before: terms({ oreLines: lines }),
            after: terms({ oreLines: [...lines].reverse() }),
          },
        ],
      })
    ).toBeNull();
  });
});

describe('planBookToleranceRecordChanges', () => {
  const payments = [payment('p1', 996_000, '2026-11-02T10:00:00Z')];
  const account = MinerRunningAccount.build({
    days: [{ date: '2026-11-01', tax: 1_000_000 }],
    payments,
  });
  const book = (characterIds: number[]) => ({
    corporationId: 98000001,
    characterIds,
    miners: [{ id: 'm1', characterIds: [7, 8], mainCharacterId: 7 }],
    accounts: [{ minerId: 'm1', account, payments }],
  });

  it("saves each of the pilot's own close-outs under the first of their Characters the book tracks", () => {
    expect(planBookToleranceRecordChanges([book([8])], new Set())).toEqual([
      {
        characterId: 8,
        change: expect.objectContaining({
          id: 'tolerance:98000001:m1:2026-11-01',
          reason: 'tolerance',
        }),
      },
    ]);
  });

  it("skips a miner none of the pilot's Characters belongs to, and days already saved", () => {
    expect(planBookToleranceRecordChanges([book([9])], new Set())).toEqual([]);
    expect(
      planBookToleranceRecordChanges([book([7])], new Set(['tolerance:98000001:m1:2026-11-01']))
    ).toEqual([]);
  });
});

describe('which ledger a Record Change shows in', () => {
  const tolerance = (corporationId: number, minerId: string): RecordChange => ({
    id: `t:${corporationId}:${minerId}`,
    reason: 'tolerance',
    at: '2026-11-02T00:00:00Z',
    date: '2026-11-01',
    corporationId,
    minerId,
    closeOut: { billed: 1, paid: 1, writtenOff: 0, tolerancePct: 0.5 },
  });
  const moved: RecordChange = {
    id: 'moved',
    reason: 'autoAssign',
    at: '2026-11-02T00:00:00Z',
    date: '2026-11-01',
    corporationId: 98000001,
    assignments: [
      { assignmentId: 'a', before: terms({ payeeId: 'p1' }), after: terms({ payeeId: 'p2' }) },
    ],
  };

  it("shows in the book's ledger for its corporation and miner", () => {
    const changes = [tolerance(98000001, 'm1'), tolerance(98000001, 'm2'), tolerance(9, 'm1')];
    expect(recordChangesForBook(changes, 98000001, 'm1').map((c) => c.id)).toEqual([
      't:98000001:m1',
    ]);
    expect(recordChangesForBook([moved], 98000001, 'm1')).toEqual([moved]);
  });

  it('shows an Assignment change in the ledger of every Payee it touched', () => {
    expect(recordChangesForPayee([moved], (id) => id === 'p1')).toEqual([moved]);
    expect(recordChangesForPayee([moved], (id) => id === 'p2')).toEqual([moved]);
    expect(recordChangesForPayee([moved], (id) => id === 'p3')).toEqual([]);
    expect(recordChangesForPayee([tolerance(1, 'm1')], () => true)).toEqual([]);
  });
});
