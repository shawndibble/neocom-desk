import { describe, it, expect } from 'vitest';
import {
  buildBookView,
  minerDetail,
  paymentCode,
  planStatementRuns,
  statementDetail,
  type BookViewInput,
} from './bookView';
import { draftNotice, owedDays, planNotices } from './lateNotices';
import { DEFAULT_NOTICE_RULES, type NoticeRules } from './notices';
import { planCloseAccount } from './closeAccount';
import type { Statement } from './statements';
import type { ObservedMiningEntry } from './types';

const CORP = 98000001;
const ORE = 45490;

function entry(characterId: number, date: string, quantity: number): ObservedMiningEntry {
  return {
    characterId,
    recordedCorporationId: CORP,
    structureId: 1001,
    date,
    oreLines: [{ typeId: ORE, quantity }],
  };
}

/** 1,000 ISK per unit at 10%: 1,000 units owe 100,000. Every day here owes 10M (100,000 units). */
function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [
      entry(1, '2026-09-01', 100_000),
      entry(1, '2026-09-02', 100_000),
      entry(1, '2026-09-10', 100_000),
    ],
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    paidStatementIds: new Set(),
    runningAccountFrom: '2026-08-01T00:00:00Z',
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    ...overrides,
  };
}

const pay = (amount: number, at = '2026-09-18T10:00:00Z', statementId?: string) => ({
  id: `p${amount}${at}`,
  minerId: 'solo:1',
  characterId: 1,
  amount,
  at,
  source: 'donation' as const,
  ...(statementId ? { statementId } : {}),
});

const rules = (over: Partial<NoticeRules> = {}): NoticeRules => ({
  ...DEFAULT_NOTICE_RULES,
  ...over,
});

/** Issues every notice the plan holds, as the run does. */
const issue = (base: BookViewInput, now = base.now): Statement[] =>
  planNotices(buildBookView({ ...base, now }), rules(), now).map(({ statement }) => statement);

describe('planNotices (#6294)', () => {
  it('is due once the oldest unpaid day is N days old and the Miner owes the minimum', () => {
    const [plan] = planNotices(buildBookView(input()), rules());
    expect(plan.minerId).toBe('solo:1');
    expect(plan.owed).toBe(30_000_000);
    expect(plan.carried).toBe(0);
    expect(plan.statement).toMatchObject({
      id: 'notice_2026-09-01_solo:1_2026-09-18',
      kind: 'notice',
      minerId: 'solo:1',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-10',
      coversFrom: '2026-09-01',
      coversThrough: '2026-09-10',
      issuedAt: '2026-09-18T14:00:00Z',
      amount: 30_000_000,
      characterIds: [1],
    });
    expect(plan.statement.code).toBe(paymentCode(plan.statement.id));
    expect(plan.statement.lines.map((l) => [l.date, l.tax])).toEqual([
      ['2026-09-01', 10_000_000],
      ['2026-09-02', 10_000_000],
      ['2026-09-10', 10_000_000],
    ]);
  });

  it('waits while the oldest unpaid day is younger, or the Miner owes under the minimum', () => {
    const view = buildBookView(input());
    expect(planNotices(view, rules({ after: { kind: 'behind', days: 18 } }))).toEqual([]);
    expect(planNotices(view, rules({ minimum: 30_000_001 }))).toEqual([]);
    // Paid the first day: now the oldest unpaid day is 16 days old.
    const paid = buildBookView(input({ payments: [pay(10_000_000)] }));
    expect(planNotices(paid, rules({ after: { kind: 'behind', days: 17 } }))).toEqual([]);
    expect(planNotices(paid, rules({ after: { kind: 'behind', days: 16 } }))).toHaveLength(1);
  });

  it('sends none once the Miner is paid up, and none to a closed account', () => {
    expect(planNotices(buildBookView(input({ payments: [pay(30_000_000)] })), rules())).toEqual([]);
    const closed = input({
      miners: [
        {
          id: 'solo:1',
          characterIds: [1],
          mainCharacterId: 1,
          closedAt: '2026-09-15T00:00:00Z',
        } as BookViewInput['miners'][number],
      ],
    });
    expect(planNotices(buildBookView(closed), rules())).toEqual([]);
  });

  it('waits out the cooldown after a notice, then lists only days no notice listed and carries the rest', () => {
    const first = issue(input());
    const later = input({
      statements: first,
      entries: [...input().entries, entry(1, '2026-09-20', 50_000)],
      lastSyncedAt: '2026-09-24T12:00:00Z',
    });
    expect(planNotices(buildBookView({ ...later, now: '2026-09-24T14:00:00Z' }), rules())).toEqual(
      []
    );
    const [next] = planNotices(buildBookView({ ...later, now: '2026-09-25T14:00:00Z' }), rules());
    expect(next.statement.id).toBe('notice_2026-09-20_solo:1_2026-09-25');
    expect(next.statement.lines.map((l) => l.date)).toEqual(['2026-09-20']);
    expect(next.statement.amount).toBe(5_000_000);
    expect(next.owed).toBe(35_000_000);
    expect(next.carried).toBe(30_000_000);
  });

  it('on a day of the month: due on or after it while owing from before it, once a month', () => {
    const monthly = rules({ after: { kind: 'dayOfMonth', day: 15 } });
    expect(planNotices(buildBookView(input()), monthly)).toHaveLength(1);
    expect(
      planNotices(buildBookView(input({ now: '2026-09-14T14:00:00Z' })), monthly)
    ).toHaveLength(0);
    const sent = input({
      statements: [
        {
          ...draftNotice(buildBookView(input()), 'solo:1')!.statement,
          issuedAt: '2026-09-15T09:00:00Z',
        },
      ],
    });
    // Out of the cooldown, but this month's notice went already.
    expect(planNotices(buildBookView({ ...sent, now: '2026-10-14T14:00:00Z' }), monthly)).toEqual(
      []
    );
    expect(
      planNotices(buildBookView({ ...sent, now: '2026-10-15T14:00:00Z' }), monthly)
    ).toHaveLength(1);
  });
});

describe('a late notice on the running account (#6294)', () => {
  const notice = () => issue(input())[0];

  it('leaves its days running days: the same owed, oldest first, with no calendar run', () => {
    const before = buildBookView(input());
    const after = buildBookView(input({ statements: [notice()] }));
    expect(after.miners[0].owed).toBe(30_000_000);
    expect(after.miners[0].account).toEqual(before.miners[0].account);
    const days = minerDetail(after, 'solo:1')!.days;
    expect(days.map((d) => [d.date, d.status, d.owed, d.statementId])).toEqual([
      ['2026-09-10', 'unbilled', 10_000_000, notice().id],
      ['2026-09-02', 'unbilled', 10_000_000, notice().id],
      ['2026-09-01', 'unbilled', 10_000_000, notice().id],
    ]);
    expect(planStatementRuns(after)).toEqual([]);
  });

  it("credits a payment carrying its code to the Miner's oldest day, and settles it once its days are paid", () => {
    const n = notice();
    const part = buildBookView(
      input({ statements: [n], payments: [pay(15_000_000, '2026-09-19T00:00:00Z', n.id)] })
    );
    expect(part.miners[0].account?.paidThrough).toBe('2026-09-01');
    expect(part.miners[0].owed).toBe(15_000_000);
    expect(statementDetail(part, n.id)).toMatchObject({ settled: false, outstanding: 15_000_000 });

    const paid = buildBookView(
      input({ statements: [n], payments: [pay(30_000_000, '2026-09-19T00:00:00Z', n.id)] })
    );
    expect(paid.miners[0]).toMatchObject({ owed: 0, credit: 0, overdueDays: null });
    expect(statementDetail(paid, n.id)).toMatchObject({ settled: true, outstanding: 0 });
  });

  it('goes Overdue from its issue while its days are unpaid, and a leaver points at it', () => {
    const n = notice();
    const late = buildBookView(
      input({ statements: [n], now: '2026-10-05T14:00:00Z', lastSyncedAt: '2026-10-05T12:00:00Z' })
    );
    expect(late.miners[0].overdueDays).toBe(3);
    expect(late.needsYou).toContainEqual(
      expect.objectContaining({ kind: 'overdue', statementId: n.id })
    );
    const left = buildBookView(
      input({
        statements: [n],
        memberIds: new Set(),
      })
    );
    // A guest is never a leaver; this Miner mined for the corp, so with no members it has left.
    expect(left.needsYou).toContainEqual(
      expect.objectContaining({ kind: 'leaver', statementId: n.id })
    );
  });

  it('is never a paid Statement whose days close: ore recorded later on its day is still owed (D22)', () => {
    const n = notice();
    const view = buildBookView(
      input({
        statements: [n],
        payments: [pay(30_000_000)],
        // The server's Statement math counts this notice settled; on the account its days decide.
        paidStatementIds: new Set([n.id]),
        entries: [...input().entries, { ...entry(1, '2026-09-01', 10_000), structureId: 1002 }],
      })
    );
    expect(minerDetail(view, 'solo:1')!.lateWriteOffs).toEqual([]);
    expect(view.miners[0].owed).toBe(1_000_000);
  });

  it("lists every unpaid day for the notice mail, oldest first, with each day's place", () => {
    const view = buildBookView(input({ statements: [notice()], payments: [pay(15_000_000)] }));
    expect(owedDays(view, 'solo:1')).toEqual([
      { date: '2026-09-02', structureId: 1001, owed: 5_000_000 },
      { date: '2026-09-10', structureId: 1001, owed: 10_000_000 },
    ]);
  });

  it("closes a guest's running account with a final notice of the unpaid days no notice listed", () => {
    const view = buildBookView(input({ payments: [pay(10_000_000)] }));
    const plan = planCloseAccount(view, 'solo:1')!;
    expect(plan.statement?.kind).toBe('notice');
    expect(plan.statement?.lines.map((l) => l.date)).toEqual(['2026-09-02', '2026-09-10']);
    expect(plan.owedAfter).toBe(20_000_000);
    expect(plan.creditAfter).toBe(0);
  });
});
