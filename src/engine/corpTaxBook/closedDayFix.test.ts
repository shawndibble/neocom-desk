import { describe, expect, it } from 'vitest';
import {
  closedDayRecordChangeId,
  planClosedDayFix as planWith,
  type ClosedDay,
  type ClosedDayBook,
} from './closedDayFix';
import type { PersonalAllocation } from './personal';

const planClosedDayFix = (day: ClosedDay, paidInto: ReadonlySet<string> = new Set()) =>
  planWith(day, paidInto);

const ME = 90000001;
const SYSTEM = 30003838;
const ZEO = 45490;
const SYL = 45491;
const CORP_A = 98000001;
const CORP_B = 98000002;

const bookOf = (over: Partial<ClosedDayBook> = {}): ClosedDayBook => ({
  corporationId: CORP_A,
  minerId: `solo:${ME}`,
  ownPayeeIds: ['own-a'],
  share: [{ typeId: ZEO, quantity: 60 }],
  taxPct: 10,
  unitPrices: { [ZEO]: 100, [SYL]: 50 },
  oreForm: 'compressed',
  moneyApplied: false,
  ...over,
});

const alloc = (over: Partial<PersonalAllocation> & { id: string }): PersonalAllocation => ({
  payeeId: 'own-a',
  taxPct: 10,
  oreLines: [{ typeId: ZEO, quantity: 100 }],
  status: 'outstanding',
  ...over,
});

const dayOf = (over: Partial<ClosedDay> = {}): ClosedDay => ({
  characterId: ME,
  date: '2026-11-20',
  solarSystemId: SYSTEM,
  oreLines: [{ typeId: ZEO, quantity: 100 }],
  allocations: [alloc({ id: 'c' })],
  books: [bookOf()],
  ...over,
});

describe('planClosedDayFix', () => {
  it('shrinks an over-listed corp Assignment to the book and frees the rest', () => {
    const plan = planClosedDayFix(dayOf());
    expect(plan.state).toBe('fix');
    expect(plan.blockers).toEqual([]);
    expect(plan.fixes).toEqual([
      {
        assignmentId: 'c',
        payeeId: 'own-a',
        corporationId: CORP_A,
        before: { oreLines: [{ typeId: ZEO, quantity: 100 }], taxPct: 10 },
        after: { oreLines: [{ typeId: ZEO, quantity: 60 }], taxPct: 10 },
        releasedTypeIds: [ZEO],
      },
    ]);
  });

  it('moves ore from another split when the miner listed too little for the corp', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [
          alloc({ id: 'c', oreLines: [{ typeId: ZEO, quantity: 40 }] }),
          alloc({
            id: 'x',
            payeeId: 'buddy',
            taxPct: 5,
            oreLines: [{ typeId: ZEO, quantity: 60 }],
          }),
        ],
        books: [bookOf({ share: [{ typeId: ZEO, quantity: 70 }] })],
      })
    );
    expect(plan.state).toBe('fix');
    expect(plan.fixes.map((f) => [f.assignmentId, f.after])).toEqual([
      ['c', { oreLines: [{ typeId: ZEO, quantity: 70 }], taxPct: 10 }],
      ['x', { oreLines: [{ typeId: ZEO, quantity: 30 }], taxPct: 5 }],
    ]);
    expect(plan.fixes[1]!.releasedTypeIds).toEqual([ZEO]);
    expect(plan.fixes[1]!.corporationId).toBeUndefined();
  });

  it('takes the free ore before another split', () => {
    const plan = planClosedDayFix(
      dayOf({
        oreLines: [{ typeId: ZEO, quantity: 120 }],
        allocations: [
          alloc({ id: 'c', oreLines: [{ typeId: ZEO, quantity: 40 }] }),
          alloc({ id: 'x', payeeId: 'buddy', oreLines: [{ typeId: ZEO, quantity: 60 }] }),
        ],
        books: [bookOf({ share: [{ typeId: ZEO, quantity: 70 }] })],
      })
    );
    expect(plan.fixes.map((f) => [f.assignmentId, f.after.oreLines])).toEqual([
      ['c', [{ typeId: ZEO, quantity: 70 }]],
      ['x', [{ typeId: ZEO, quantity: 50 }]],
    ]);
  });

  it('fixes a day split wrong between two corps so each Assignment matches its book', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [
          alloc({ id: 'a', oreLines: [{ typeId: ZEO, quantity: 70 }] }),
          alloc({ id: 'b', payeeId: 'own-b', oreLines: [{ typeId: ZEO, quantity: 30 }] }),
        ],
        books: [
          bookOf({ share: [{ typeId: ZEO, quantity: 40 }] }),
          bookOf({
            corporationId: CORP_B,
            ownPayeeIds: ['own-b'],
            taxPct: 8,
            share: [{ typeId: ZEO, quantity: 60 }],
          }),
        ],
      })
    );
    expect(plan.state).toBe('fix');
    expect(plan.fixes.map((f) => [f.assignmentId, f.corporationId, f.after])).toEqual([
      ['a', CORP_A, { oreLines: [{ typeId: ZEO, quantity: 40 }], taxPct: 10 }],
      ['b', CORP_B, { oreLines: [{ typeId: ZEO, quantity: 60 }], taxPct: 8 }],
    ]);
  });

  it('follows the book rate even when the ore already matches', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [alloc({ id: 'c', taxPct: 12, oreLines: [{ typeId: ZEO, quantity: 60 }] })],
      })
    );
    expect(plan.fixes).toHaveLength(1);
    expect(plan.fixes[0]!.after).toEqual({ oreLines: [{ typeId: ZEO, quantity: 60 }], taxPct: 10 });
  });

  it('is aligned once the records match the book', () => {
    const plan = planClosedDayFix(
      dayOf({ allocations: [alloc({ id: 'c', oreLines: [{ typeId: ZEO, quantity: 60 }] })] })
    );
    expect(plan).toMatchObject({ state: 'aligned', fixes: [], blockers: [] });
  });

  it('is aligned when the miner split nothing that day', () => {
    expect(planClosedDayFix(dayOf({ allocations: [] })).state).toBe('aligned');
  });

  it('removes a corp Assignment holding only ore the book did not record', () => {
    const plan = planClosedDayFix(
      dayOf({
        oreLines: [
          { typeId: ZEO, quantity: 60 },
          { typeId: SYL, quantity: 20 },
        ],
        allocations: [
          alloc({ id: 'c', oreLines: [{ typeId: ZEO, quantity: 60 }] }),
          alloc({ id: 'c2', oreLines: [{ typeId: SYL, quantity: 20 }] }),
        ],
      })
    );
    expect(plan.fixes).toEqual([
      expect.objectContaining({
        assignmentId: 'c2',
        after: { oreLines: [], taxPct: 10 },
        releasedTypeIds: [ZEO, SYL],
      }),
    ]);
  });

  it('creates the corp Assignment from another split when the miner listed none for it', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [alloc({ id: 'x', payeeId: 'buddy' })],
        books: [bookOf({ ownPayeeIds: ['own-a', 'own-a2'] })],
      })
    );
    expect(plan.fixes).toEqual([
      {
        assignmentId: 'x',
        payeeId: 'buddy',
        before: { oreLines: [{ typeId: ZEO, quantity: 100 }], taxPct: 10 },
        after: { oreLines: [{ typeId: ZEO, quantity: 40 }], taxPct: 10 },
        releasedTypeIds: [ZEO],
      },
      {
        assignmentId: null,
        payeeId: 'own-a',
        corporationId: CORP_A,
        before: null,
        after: { oreLines: [{ typeId: ZEO, quantity: 60 }], taxPct: 10 },
        releasedTypeIds: [ZEO],
      },
    ]);
  });

  it('cannot create a corp Assignment without a Payee for the corp', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [alloc({ id: 'x', payeeId: 'buddy' })],
        books: [bookOf({ ownPayeeIds: [] })],
      })
    );
    expect(plan.state).toBe('aligned');
  });

  it('clears a growth review on the corp Assignment and stops the growth coming back', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [
          alloc({ id: 'c', status: 'needs-review', oreLines: [{ typeId: ZEO, quantity: 60 }] }),
        ],
      })
    );
    expect(plan.state).toBe('fix');
    expect(plan.fixes).toEqual([
      expect.objectContaining({
        assignmentId: 'c',
        after: { oreLines: [{ typeId: ZEO, quantity: 60 }], taxPct: 10 },
        releasedTypeIds: [ZEO],
      }),
    ]);
  });

  it('is a Conflict, not a fix, when a changed Assignment is paid', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [
          alloc({ id: 'c', oreLines: [{ typeId: ZEO, quantity: 40 }] }),
          alloc({
            id: 'x',
            payeeId: 'buddy',
            status: 'paid',
            oreLines: [{ typeId: ZEO, quantity: 60 }],
          }),
        ],
      })
    );
    expect(plan.state).toBe('conflict');
    expect(plan.blockers).toEqual([{ kind: 'assignmentPaid', assignmentId: 'x' }]);
    expect(plan.fixes).toHaveLength(2);
  });

  it('takes from an unpaid split before a paid one, so the day can still be fixed', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [
          alloc({ id: 'c', oreLines: [{ typeId: ZEO, quantity: 40 }] }),
          alloc({
            id: 'p',
            payeeId: 'buddy',
            status: 'paid',
            oreLines: [{ typeId: ZEO, quantity: 30 }],
          }),
          alloc({ id: 'u', payeeId: 'pal', oreLines: [{ typeId: ZEO, quantity: 30 }] }),
        ],
      })
    );
    expect(plan.state).toBe('fix');
    expect(plan.fixes.map((f) => [f.assignmentId, f.after.oreLines])).toEqual([
      ['c', [{ typeId: ZEO, quantity: 60 }]],
      ['u', [{ typeId: ZEO, quantity: 10 }]],
    ]);
  });

  it('is a Conflict when money was paid into a changed Assignment', () => {
    const plan = planClosedDayFix(dayOf(), new Set(['c']));
    expect(plan.state).toBe('conflict');
    expect(plan.blockers).toEqual([{ kind: 'assignmentPaid', assignmentId: 'c' }]);
  });

  it('ignores a paid Assignment it does not change', () => {
    const plan = planClosedDayFix(
      dayOf({
        oreLines: [
          { typeId: ZEO, quantity: 100 },
          { typeId: SYL, quantity: 10 },
        ],
        allocations: [
          alloc({ id: 'c' }),
          alloc({
            id: 'x',
            payeeId: 'buddy',
            status: 'paid',
            oreLines: [{ typeId: SYL, quantity: 10 }],
          }),
        ],
      })
    );
    expect(plan.state).toBe('fix');
  });

  it('is a Conflict when the book applied money to the day', () => {
    const plan = planClosedDayFix(dayOf({ books: [bookOf({ moneyApplied: true })] }));
    expect(plan.state).toBe('conflict');
    expect(plan.blockers).toEqual([{ kind: 'bookPayment', corporationId: CORP_A }]);
  });

  it('raises no Conflict for a paid day that already matches', () => {
    const plan = planClosedDayFix(
      dayOf({
        allocations: [alloc({ id: 'c', oreLines: [{ typeId: ZEO, quantity: 60 }] })],
        books: [bookOf({ moneyApplied: true })],
      })
    );
    expect(plan.state).toBe('aligned');
  });
});

describe('closedDayRecordChangeId', () => {
  it('is the same for the same fix and differs when the outcome differs', () => {
    const one = planClosedDayFix(dayOf());
    const again = planClosedDayFix(dayOf());
    const other = planClosedDayFix(
      dayOf({ books: [bookOf({ share: [{ typeId: ZEO, quantity: 50 }] })] })
    );
    expect(closedDayRecordChangeId(one, 'autoFix')).toBe(closedDayRecordChangeId(again, 'autoFix'));
    expect(closedDayRecordChangeId(one, 'autoFix')).not.toBe(
      closedDayRecordChangeId(other, 'autoFix')
    );
    expect(closedDayRecordChangeId(one, 'autoFix')).toMatch(
      /^autoFix:90000001:2026-11-20:30003838:/
    );
    expect(closedDayRecordChangeId(one, 'fixMyRecords')).toMatch(/^fixMyRecords:/);
  });
});
