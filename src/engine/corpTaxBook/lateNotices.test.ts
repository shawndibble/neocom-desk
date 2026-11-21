import { describe, it, expect } from 'vitest';
import { bookMiner, buildBookView, noticeDetail, type BookViewInput } from './bookView';
import { minerPaymentCode, type LateNotice } from '../../../functions/src/corpTaxBookLateNotice';
import { draftNotice, owedDays, planNotices, readLateNotices } from './lateNotices';
import { DEFAULT_NOTICE_RULES, type NoticeRules } from './notices';
import { planCloseAccount } from './closeAccount';
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
    overdueDays: 14,
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
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    ...overrides,
  };
}

const pay = (amount: number, at = '2026-09-18T10:00:00Z') => ({
  id: `p${amount}${at}`,
  minerId: 'solo:1',
  characterId: 1,
  amount,
  at,
  source: 'donation' as const,
});

const rules = (over: Partial<NoticeRules> = {}): NoticeRules => ({
  ...DEFAULT_NOTICE_RULES,
  ...over,
});

/** Issues every notice the plan holds, as the run does. */
const issue = (base: BookViewInput, now = base.now): LateNotice[] =>
  planNotices(buildBookView({ ...base, now }), rules(), now).map(({ notice }) => notice);

describe('planNotices (#6294)', () => {
  it('is due once the oldest unpaid day is N days old and the Miner owes the minimum', () => {
    const [plan] = planNotices(buildBookView(input()), rules());
    expect(plan.owed).toBe(30_000_000);
    expect(plan.carried).toBe(0);
    expect(plan.notice).toMatchObject({
      id: 'notice_2026-09-01_solo:1_2026-09-18',
      kind: 'late',
      minerId: 'solo:1',
      issuedAt: '2026-09-18T14:00:00Z',
      listed: 30_000_000,
      characterIds: [1],
      pricing: { hubId: 'jita', oreForm: 'compressed' },
      mail: { sent: 0, manualSent: 0, remindersStopped: false },
    });
    // The server sets a notice's code itself, as this, and refuses any other. One code per Miner: the one the mail asks for, whichever notice it is.
    expect(plan.notice.code).toBe(minerPaymentCode(plan.notice.minerId));
    expect(plan.notice.lines.map((l) => [l.date, l.tax])).toEqual([
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

  it('is due early once the Miner owes the early amount, before the days rule', () => {
    const view = buildBookView(input());
    const young = rules({ after: { kind: 'behind', days: 18 } });
    expect(planNotices(view, young)).toEqual([]);
    expect(planNotices(view, { ...young, earlyAt: 30_000_001 })).toEqual([]);
    expect(planNotices(view, { ...young, earlyAt: 30_000_000 })).toHaveLength(1);
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
      notices: first,
      entries: [...input().entries, entry(1, '2026-09-20', 50_000)],
      lastSyncedAt: '2026-09-24T12:00:00Z',
    });
    expect(planNotices(buildBookView({ ...later, now: '2026-09-24T14:00:00Z' }), rules())).toEqual(
      []
    );
    const [next] = planNotices(buildBookView({ ...later, now: '2026-09-25T14:00:00Z' }), rules());
    expect(next.notice.id).toBe('notice_2026-09-20_solo:1_2026-09-25');
    expect(next.notice.lines.map((l) => l.date)).toEqual(['2026-09-20']);
    expect(next.notice.listed).toBe(5_000_000);
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
      notices: [
        {
          ...draftNotice(buildBookView(input()), 'solo:1')!.notice,
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

  it("pays the Miner's oldest day with any payment, and settles once its days are paid", () => {
    const n = notice();
    const part = buildBookView(
      input({ notices: [n], payments: [pay(15_000_000, '2026-09-19T00:00:00Z')] })
    );
    expect(bookMiner(part, part.miners[0].id)?.account.paidThrough).toBe('2026-09-01');
    expect(part.miners[0].owed).toBe(15_000_000);
    expect(noticeDetail(part, n.id)).toMatchObject({ settled: false, outstanding: 15_000_000 });

    const paid = buildBookView(
      input({ notices: [n], payments: [pay(30_000_000, '2026-09-19T00:00:00Z')] })
    );
    expect(paid.miners[0]).toMatchObject({ owed: 0, credit: 0, overdueDays: null });
    expect(noticeDetail(paid, n.id)).toMatchObject({ settled: true, outstanding: 0 });
  });

  it('goes Overdue from its issue while its days are unpaid, and a leaver points at it', () => {
    const n = notice();
    const late = buildBookView(
      input({ notices: [n], now: '2026-10-05T14:00:00Z', lastSyncedAt: '2026-10-05T12:00:00Z' })
    );
    expect(late.miners[0].overdueDays).toBe(3);
    expect(late.needsYou).toContainEqual(
      expect.objectContaining({ kind: 'overdue', noticeId: n.id })
    );
    const left = buildBookView(
      input({
        notices: [n],
        memberIds: new Set(),
      })
    );
    // A guest is never a leaver; this Miner mined for the corp, so with no members it has left.
    expect(left.needsYou).toContainEqual(
      expect.objectContaining({ kind: 'leaver', noticeId: n.id })
    );
  });

  it("lists every unpaid day for the notice mail, oldest first, with each day's place", () => {
    const view = buildBookView(input({ notices: [notice()], payments: [pay(15_000_000)] }));
    expect(owedDays(view, 'solo:1')).toEqual([
      { date: '2026-09-02', structureId: 1001, owed: 5_000_000 },
      { date: '2026-09-10', structureId: 1001, owed: 10_000_000 },
    ]);
  });

  it('lists what is owed net of a credit correction, and a charge as a line of its own (M3)', () => {
    const adjustment = (id: string, date: string, amount: number) => ({
      id,
      minerId: 'solo:1',
      date,
      amount,
      reason: 'x',
      by: 2,
      at: '2026-09-12T00:00:00Z',
    });
    const view = buildBookView(
      input({
        adjustments: [
          adjustment('c1', '2026-09-01', -3_000_000),
          adjustment('c2', '2026-09-10', 2_000_000),
        ],
      })
    );
    expect(owedDays(view, 'solo:1')).toEqual([
      { date: '2026-09-01', structureId: 1001, owed: 7_000_000 },
      { date: '2026-09-02', structureId: 1001, owed: 10_000_000 },
      { date: '2026-09-10', owed: 2_000_000, correction: true },
      { date: '2026-09-10', structureId: 1001, owed: 10_000_000 },
    ]);
    const sum = owedDays(view, 'solo:1').reduce((s, d) => s + d.owed, 0);
    expect(sum).toBe(view.miners[0]!.owed);
    // A notice of every one of those days carries nothing from earlier notices.
    expect(draftNotice(view, 'solo:1')!.carried).toBe(0);
  });

  it("closes a guest's running account with a final notice of the unpaid days no notice listed", () => {
    const view = buildBookView(input({ payments: [pay(10_000_000)] }));
    const plan = planCloseAccount(view, 'solo:1')!;
    expect(plan.notice).toMatchObject({ kind: 'final', id: 'final_solo:1' });
    expect(plan.notice?.lines.map((l) => l.date)).toEqual(['2026-09-02', '2026-09-10']);
    expect(plan.owedAfter).toBe(20_000_000);
    expect(plan.creditAfter).toBe(0);
  });
});

describe('readLateNotices: both stores, as the server reads them', () => {
  const legacy = (over: Record<string, unknown> = {}) => ({
    id: 'n1',
    kind: 'notice',
    minerId: 'solo:1',
    issuedAt: '2026-09-02T00:00:00Z',
    lines: [
      {
        kind: 'mined',
        date: '2026-09-01',
        chargeKey: '1:1001:2026-09-01',
        tax: 5,
        estimatedValue: 50,
      },
    ],
    amount: 5,
    characterIds: [1],
    uids: ['char:1'],
    mailsSent: 1,
    manualRemindersSent: 0,
    remindersStopped: false,
    ...over,
  });

  it('reads a legacy notice, and leaves out a legacy calendar bill (mergeNoticeDocs)', () => {
    const [n] = readLateNotices([], [legacy()]);
    expect(n).toMatchObject({ id: 'n1', minerId: 'solo:1', listed: 5 });
    expect(readLateNotices([], [legacy({ kind: undefined })])).toEqual([]);
  });

  it('merges the mail state of both copies of one notice (mergeNoticeMail)', () => {
    const current = {
      ...readLateNotices([], [legacy()])[0]!,
      mail: { sent: 1, manualSent: 0, remindersStopped: false },
    };
    const [n] = readLateNotices([current], [legacy({ remindersStopped: true, mailsSent: 2 })]);
    expect(n!.mail).toMatchObject({ sent: 2, remindersStopped: true });
  });
});
