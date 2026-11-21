import { describe, it, expect } from 'vitest';
import { accountLedger } from './accountLedger';
import {
  buildBookView,
  extractionDetail,
  minerDetail,
  noticeDetail,
  type BookView,
  type BookViewInput,
} from './bookView';
import { draftNotice } from './lateNotices';
import type { ObservedMiningEntry } from './types';

const CORP = 98000001;
const ORE = 45490;

function entry(
  characterId: number,
  date: string,
  quantity: number,
  corp = CORP
): ObservedMiningEntry {
  return {
    characterId,
    recordedCorporationId: corp,
    structureId: 1001,
    date,
    oreLines: [{ typeId: ORE, quantity }],
  };
}

/** 1,000 ISK per unit at 10%: 1,000 units owe 100,000. */
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
    entries: [],
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

const pay = (id: string, amount: number, at: string, minerId = 'solo:1') => ({
  id,
  minerId,
  characterId: Number(minerId.slice(5)) || 1,
  amount,
  at,
  source: 'donation' as const,
});

describe('buildBookView: a Running account per Miner', () => {
  it('splits Billable, not-yet-Billable and before-the-book days, and owes every Billable day', () => {
    const view = buildBookView(
      input({
        entries: [
          entry(1, '2026-07-30', 1000),
          entry(1, '2026-08-10', 1000),
          entry(1, '2026-09-18', 500),
        ],
      })
    );
    const [miner] = view.miners;
    expect(miner.owed).toBe(100_000);
    expect(miner.pending).toBe(50_000);
    expect(view.beforeBook).toHaveLength(1);
    expect(miner.account.owes).toEqual({ amount: 100_000, days: 1, oldest: '2026-08-10' });
    expect(minerDetail(view, 'solo:1')!.days.map((d) => [d.date, d.status, d.owed])).toEqual([
      ['2026-09-18', 'not-billable', undefined],
      ['2026-08-10', 'owed', 100_000],
    ]);
  });

  it('pays the oldest day first and holds the rest as credit', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-08-11', 2000)],
        payments: [pay('p1', 150_000, '2026-09-01T00:00:00Z')],
      })
    );
    const days = minerDetail(view, 'solo:1')!.days;
    expect(days.map((d) => [d.date, d.status, d.owed])).toEqual([
      ['2026-08-11', 'owed', 150_000],
      ['2026-08-10', 'paid', undefined],
    ]);
    expect(view.miners[0].account.paidThrough).toBe('2026-08-10');
    expect(view.totals).toMatchObject({ owed: 150_000, credit: 0 });
  });

  it('counts a donation before the start date and credits it nowhere (#4505)', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000)],
        payments: [pay('early', 100_000, '2026-07-20T00:00:00Z')],
      })
    );
    expect(view.donationsBeforeBook).toBe(1);
    expect(view.miners[0].owed).toBe(100_000);
  });

  it('forgives the oldest days with an officer write-off (#4637)', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-08-11', 1000)],
        writeOffs: [
          { id: 'w1', minerId: 'solo:1', amount: 100_000, at: '2026-09-01T00:00:00Z', reason: 'x' },
        ],
      })
    );
    expect(view.miners[0].account.owes).toEqual({ amount: 100_000, days: 1, oldest: '2026-08-11' });
    expect(minerDetail(view, 'solo:1')!.officerWriteOffs).toEqual([
      { id: 'w1', amount: 100_000, reason: 'x', at: '2026-09-01T00:00:00Z' },
    ]);
  });

  it('never bills again a day the account is closed through, and reads it as paid', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
        checkpoints: new Map([
          [
            'solo:1',
            {
              minerId: 'solo:1',
              through: '2026-08-31',
              owed: [],
              credit: 0,
              balance: 0,
              paidThrough: '2026-08-31',
              characterIds: [1],
              at: '2026-10-01T00:00:00Z',
            },
          ],
        ]),
      })
    );
    expect(view.miners[0].account.owes).toEqual({ amount: 100_000, days: 1, oldest: '2026-09-10' });
    expect(minerDetail(view, 'solo:1')!.days.find((d) => d.date === '2026-08-10')?.status).toBe(
      'paid'
    );
  });

  it('ignores a checkpoint recorded for other characters than the Miner has now (B3)', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
        checkpoints: new Map([
          [
            'solo:1',
            {
              minerId: 'solo:1',
              through: '2026-08-31',
              owed: [],
              credit: 0,
              balance: 0,
              paidThrough: '2026-08-31',
              at: '2026-10-01T00:00:00Z',
              characterIds: [1, 2],
            } as never,
          ],
        ]),
      })
    );
    // Read whole: August is owed again, as if no checkpoint were stored.
    expect(view.miners[0].account.owes).toEqual({ amount: 200_000, days: 2, oldest: '2026-08-10' });
  });

  it('marks a Miner no longer in the corporation as left, and a stranger as a guest', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(2, '2026-08-10', 1000, 98000099)],
        memberIds: new Set([3]),
      })
    );
    expect(view.miners.map((m) => [m.id, m.standing])).toEqual([
      ['solo:1', 'left'],
      ['solo:2', 'guest'],
    ]);
  });
});

describe('late notices on the view', () => {
  const owing = input({ entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-08-11', 1000)] });
  const notice = {
    ...draftNotice(buildBookView(owing), 'solo:1', { now: '2026-08-20T00:00:00Z' })!.notice,
  };

  it('runs an unpaid notice’s Overdue clock from its issue, and names it in Needs you', () => {
    const view = buildBookView({ ...owing, notices: [notice] });
    expect(view.miners[0].overdueDays).toBe(15);
    expect(view.needsYou).toContainEqual({
      kind: 'overdue',
      minerId: 'solo:1',
      days: 15,
      owed: 200_000,
      noticeId: notice.id,
    });
    expect(minerDetail(view, 'solo:1')!.days.every((d) => d.noticeId === notice.id)).toBe(true);
  });

  it('pauses the clock for a declaration, which Needs you asks an officer to answer', () => {
    const view = buildBookView({
      ...owing,
      notices: [notice],
      declarations: [
        { id: 'x1', statementId: notice.id, kind: 'contract', at: '2026-09-15T00:00:00Z' },
      ],
    });
    expect(view.miners[0]).toMatchObject({ overdueDays: null, paused: true });
    expect(view.needsYou[0]).toMatchObject({ kind: 'declaration', minerId: 'solo:1' });
  });

  it('settles a notice once every day it listed is paid, whatever code the money carried', () => {
    const view = buildBookView({
      ...owing,
      notices: [notice],
      payments: [pay('p1', 200_000, '2026-09-01T00:00:00Z')],
    });
    expect(noticeDetail(view, notice.id)).toMatchObject({
      billed: 200_000,
      paid: 200_000,
      outstanding: 0,
      settled: true,
      state: 'settled',
      mail: { kind: 'not-mailed', count: 0 },
    });
    expect(view.miners[0].overdueDays).toBeNull();
  });

  it('reads a part-paid notice’s figures off the account, whole ISK that add up', () => {
    const view = buildBookView({
      ...owing,
      notices: [notice],
      payments: [pay('p1', 50_000.4, '2026-09-01T00:00:00Z')],
    });
    const d = noticeDetail(view, notice.id)!;
    expect([d.billed, d.paid, d.outstanding, d.settled]).toEqual([200_000, 50_000, 150_000, false]);
    expect(noticeDetail(view, 'nope')).toBeUndefined();
  });

  it('asks a leaver for what they owe, by their newest notice', () => {
    const view = buildBookView({ ...owing, notices: [notice], memberIds: new Set() });
    expect(view.needsYou).toContainEqual({
      kind: 'leaver',
      minerId: 'solo:1',
      owed: 200_000,
      noticeId: notice.id,
    });
  });

  it('lists a stranger’s donation as Unmatched', () => {
    const view = buildBookView({
      ...owing,
      payments: [
        { id: 'u1', characterId: 77, amount: 5, at: '2026-09-01T00:00:00Z', source: 'donation' },
      ],
    });
    expect(view.needsYou.map((n) => n.kind)).toContain('unmatched');
  });
});

describe('extractionDetail', () => {
  it('sums each Miner’s tax on the Extraction’s days', () => {
    const PULL = {
      structureId: 1001,
      moonId: 40,
      extractionStartTime: '2026-07-27T00:00:00Z',
      chunkArrivalTime: '2026-08-09T20:00:00Z',
      naturalDecayTime: '2026-08-09T23:00:00Z',
      laserFiredAt: '2026-08-10T01:00:00Z',
    };
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(2, '2026-08-11', 500)],
        extractions: [PULL],
      })
    );
    const [row] = view.extractions;
    expect(row.tax).toBe(150_000);
    expect(extractionDetail(view, row.id)!.miners.map((m) => [m.minerId, m.tax])).toEqual([
      ['solo:1', 100_000],
      ['solo:2', 50_000],
    ]);
  });
});

describe('buildBookView with a feeder', () => {
  const FEEDER = 98000002;
  const fed = (characterId: number, date: string, quantity: number) => ({
    ...entry(characterId, date, quantity),
    sourceCorporationId: FEEDER,
  });

  it('withholds a feeder day no good read has followed, but not the book’s own days', () => {
    const view = buildBookView(
      input({
        entries: [
          fed(1, '2026-09-10', 1000),
          fed(2, '2026-09-17', 1000),
          entry(3, '2026-09-17', 1000),
        ],
        feeders: [{ corporationId: FEEDER, lastReadWellAt: '2026-09-12T00:00:00Z' }],
      })
    );
    const ids = view.miners.map((m) => m.id).sort();
    expect(ids).toEqual(['solo:1', 'solo:3']);
  });

  it('bills the feeder day once a read lands after its grace', () => {
    const view = buildBookView(
      input({
        entries: [fed(2, '2026-09-17', 1000)],
        feeders: [{ corporationId: FEEDER, lastReadWellAt: '2026-09-18T10:00:00Z' }],
      })
    );
    expect(view.miners.map((m) => m.id)).toEqual(['solo:2']);
  });
});

describe('a held day says why (#6210)', () => {
  const FEEDER = 98000002;
  const fed = (characterId: number, date: string, quantity: number) => ({
    ...entry(characterId, date, quantity),
    structureId: 2002,
    sourceCorporationId: FEEDER,
  });

  it('names the moon owner whose ledger it waits for', () => {
    const stale = input({
      entries: [fed(1, '2026-08-10', 1000), entry(1, '2026-08-20', 1000)],
      feeders: [{ corporationId: FEEDER, lastReadWellAt: '2026-08-15T10:00:00Z' }],
    });
    const days = minerDetail(buildBookView(stale), 'solo:1')!.days;
    expect(days.find((d) => d.date === '2026-08-20')).toMatchObject({
      status: 'not-billable',
      heldBy: FEEDER,
    });
    expect(days.find((d) => d.date === '2026-08-10')?.heldBy).toBeUndefined();
  });
});

describe('buildBookView: moon owner coverage (#4618)', () => {
  const OWNER = 98000002;
  const fed = (characterId: number, date: string, quantity: number) => ({
    ...entry(characterId, date, quantity),
    structureId: 2002,
    sourceCorporationId: OWNER,
  });
  const read = '2026-09-18T12:00:00Z';

  it('bills nothing for moon owner rows before, between and after coverage; bills inside a rejoined period', () => {
    const view = buildBookView(
      input({
        entries: [
          fed(1, '2026-08-20', 1000), // before the first period
          fed(1, '2026-09-01', 1000), // inside the first period
          fed(1, '2026-09-05', 1000), // the gap after it ended
          fed(1, '2026-09-10', 1000), // inside the rejoined period
        ],
        feeders: [
          {
            corporationId: OWNER,
            lastReadWellAt: read,
            coveragePeriods: [{ from: '2026-08-25', to: '2026-09-02' }, { from: '2026-09-08' }],
          },
        ],
      })
    );
    expect(view.charges.map((c) => c.date).sort()).toEqual(['2026-09-01', '2026-09-10']);
    expect(view.outsideCoverage.map((e) => e.date).sort()).toEqual(['2026-08-20', '2026-09-05']);
    const days = minerDetail(view, 'solo:1')!.days;
    expect(days.map((d) => d.date).sort()).toEqual(['2026-09-01', '2026-09-10']);
    expect(view.miners[0].owed).toBe(200_000);
  });

  it('bills nothing after coverage ended, and the book’s own refinery rows are untouched', () => {
    const view = buildBookView(
      input({
        entries: [fed(1, '2026-09-10', 1000), entry(1, '2026-09-10', 1000)],
        feeders: [
          {
            corporationId: OWNER,
            lastReadWellAt: read,
            coveragePeriods: [{ from: '2026-08-01', to: '2026-09-09' }],
          },
        ],
      })
    );
    expect(view.charges.map((c) => c.structureId)).toEqual([1001]);
    expect(view.outsideCoverage.map((e) => e.structureId)).toEqual([2002]);
  });

  it('a disconnected moon owner’s unread last day never holds the miner’s own-refinery day', () => {
    // Read well at 12 Sep 00:00: 11 Sep never closed for it, so coverage ended on 10 Sep.
    const view = buildBookView(
      input({
        entries: [fed(1, '2026-09-11', 1000), entry(1, '2026-09-11', 1000)],
        feeders: [
          {
            corporationId: OWNER,
            lastReadWellAt: '2026-09-12T00:00:00Z',
            coveragePeriods: [{ from: '2026-08-01', to: '2026-09-10' }],
          },
        ],
      })
    );
    expect(view.charges.map((c) => c.structureId)).toEqual([1001]);
  });
});

describe('accountLedger', () => {
  const pay = (id: string, amount: number, at: string) => ({
    id,
    minerId: 'solo:1',
    characterId: 1,
    amount,
    at,
    source: 'donation' as const,
  });
  const running = (payments: ReturnType<typeof pay>[]) =>
    input({
      entries: [
        entry(1, '2026-09-15', 1000),
        entry(1, '2026-09-16', 2000),
        entry(1, '2026-09-18', 500),
      ],
      payments,
    });
  const ledgerOf = (v: BookView) => accountLedger(minerDetail(v, 'solo:1')!, []);

  it('lists each day and payment oldest first with the balance after each', () => {
    const l = ledgerOf(buildBookView(running([pay('a', 100_000, '2026-09-17T10:00:00Z')])));
    expect(l.entries.map((e) => [e.kind, e.date, e.debit, e.credit, e.balance])).toEqual([
      ['day', '2026-09-15', 100_000, 0, 100_000],
      ['day', '2026-09-16', 200_000, 0, 300_000],
      ['payment', '2026-09-17', 0, 100_000, 200_000],
    ]);
    expect(l.balance).toBe(200_000);
  });

  it('names the mined days behind each day entry, so a row can open onto them', () => {
    const v = buildBookView(running([]));
    const l = ledgerOf(v);
    const keys = minerDetail(v, 'solo:1')!.days.map((d) => d.key);
    const days = l.entries.filter((e) => e.kind === 'day');
    expect(days.length).toBeGreaterThan(0);
    expect(days.flatMap((e) => e.dayKeys ?? []).every((k) => keys.includes(k))).toBe(true);
    expect(days.every((e) => e.dayKeys?.length === e.days)).toBe(true);
  });

  it('ends at the credit held when a payment is more than every billed day', () => {
    const view = buildBookView(running([pay('a', 350_000, '2026-09-17T10:00:00Z')]));
    const l = ledgerOf(view);
    expect(l.balance).toBe(-50_000);
    expect(view.miners[0].credit).toBe(50_000);
  });

  it('puts a payment after the day it lands on, and keeps today outside the balance', () => {
    const l = ledgerOf(buildBookView(running([pay('a', 100_000, '2026-09-15T01:00:00Z')])));
    expect(l.entries.slice(0, 2).map((e) => e.kind)).toEqual(['day', 'payment']);
    expect(l.notYetBilled).toEqual({ tax: 50_000, days: 1 });
  });

  it('ties out when an officer writes off a running account with no Statement', () => {
    const view = buildBookView({
      ...running([pay('a', 100_000, '2026-09-17T10:00:00Z')]),
      writeOffs: [
        {
          id: 'w1',
          minerId: 'solo:1',
          amount: 200_000,
          reason: 'Left the corp',
          at: '2026-09-18T10:00:00Z',
        },
      ],
    });
    const l = ledgerOf(view);
    expect(l.entries.some((e) => e.kind === 'writeOff')).toBe(true);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
  });

  it('ignores a reversed correction, and shows it beside its reversal so the rows still tie out', () => {
    const live = {
      id: 'c1',
      minerId: 'solo:1',
      date: '2026-09-15',
      amount: 300_000,
      reason: 'Auth rollover',
      by: 2,
      at: '2026-09-20T10:00:00Z',
    };
    const reversed = {
      ...live,
      reversed: { by: 2, at: '2026-09-21T09:00:00Z', reason: 'Entered twice' },
    };
    const before = buildBookView({ ...running([]), adjustments: [] }).miners[0];
    const view = buildBookView({ ...running([]), adjustments: [reversed] });
    expect(view.miners[0].owed).toBe(before.owed);
    const l = accountLedger(minerDetail(view, 'solo:1')!, [reversed]);
    const rows = l.entries.filter((e) => e.kind === 'correction');
    expect(rows.map((e) => [e.date, e.debit, e.credit, e.reversal ?? false])).toEqual([
      ['2026-09-15', 300_000, 0, false],
      ['2026-09-21', 0, 300_000, true],
    ]);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
  });

  it('tells each row what record it is, so a menu can act on it', () => {
    const adjustment = {
      id: 'c1',
      minerId: 'solo:1',
      date: '2026-09-16',
      amount: 300_000,
      reason: 'Rolled over',
      by: 2,
      at: '2026-09-20T10:00:00Z',
      kind: 'opening' as const,
    };
    const view = buildBookView({
      ...running([pay('a', 99_700, '2026-09-15T10:00:00Z')]),
      adjustments: [adjustment],
    });
    const detail = minerDetail(view, 'solo:1')!;
    const rows = accountLedger(detail, [adjustment]).entries;
    expect(rows.find((e) => e.kind === 'correction')).toMatchObject({
      refId: 'c1',
      opening: true,
    });
    expect(rows.find((e) => e.kind === 'tolerance')?.forDate).toBe('2026-09-15');
  });

  it('does not let a reversed write-off take the forgiveness of a live one after it', () => {
    const base = { minerId: 'solo:1', amount: 100_000, reason: 'Left the corp' };
    const reversed = {
      ...base,
      id: 'w1',
      at: '2026-09-18T10:00:00Z',
      reversed: { by: 2, at: '2026-09-19T10:00:00Z', reason: 'Came back' },
    };
    const live = { ...base, id: 'w2', at: '2026-09-20T10:00:00Z' };
    const view = buildBookView({ ...running([]), writeOffs: [reversed, live] });
    const l = accountLedger(minerDetail(view, 'solo:1')!, []);
    expect(
      l.entries
        .filter((e) => e.kind === 'writeOff' && !e.reversed && !e.reversal)
        .map((e) => e.credit)
    ).toEqual([100_000]);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
  });

  it('ignores a reversed officer write-off and shows it beside its reversal', () => {
    const writeOff = {
      id: 'w1',
      minerId: 'solo:1',
      amount: 200_000,
      reason: 'Left the corp',
      at: '2026-09-18T10:00:00Z',
    };
    const reversed = {
      ...writeOff,
      reversed: { by: 2, at: '2026-09-19T10:00:00Z', reason: 'Came back' },
    };
    const plain = buildBookView({ ...running([]) }).miners[0];
    const view = buildBookView({ ...running([]), writeOffs: [reversed] });
    expect(view.miners[0].owed).toBe(plain.owed);
    const l = accountLedger(minerDetail(view, 'solo:1')!, []);
    expect(l.entries.filter((e) => e.kind === 'writeOff').map((e) => [e.credit, e.debit])).toEqual([
      [200_000, 0],
      [0, 200_000],
    ]);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
  });

  it('owes a day’s shortfall again when an officer exempts it from tolerance, with no Market adjustment row', () => {
    // 15 Sep is 100,000; paying 99,700 leaves 300 short (0.3%), forgiven by default.
    const payments = [pay('a', 99_700, '2026-09-15T10:00:00Z')];
    const forgiven = ledgerOf(buildBookView(running(payments)));
    expect(forgiven.entries.some((e) => e.kind === 'tolerance')).toBe(true);
    const view = buildBookView({
      ...running(payments),
      toleranceExemptions: [
        {
          id: 'x1',
          minerId: 'solo:1',
          date: '2026-09-15',
          forgive: 0,
          reason: 'Charge it',
          by: 2,
          at: '2026-09-20T10:00:00Z',
        },
      ],
    });
    const l = ledgerOf(view);
    expect(l.entries.some((e) => e.kind === 'tolerance')).toBe(false);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
    expect(view.miners[0].owed).toBeGreaterThanOrEqual(300);
  });

  it('keeps a day an open dispute holds out of the ledger balance', () => {
    const view = buildBookView({
      ...running([]),
      disputes: [
        {
          id: 'd1',
          kind: 'notPaying',
          reason: 'x',
          minerId: 'solo:1',
          date: '2026-09-16',
          lines: [{ recordKey: '1:1001:2026-09-16', typeId: ORE, quantity: 1, payeeName: 'x' }],
          by: 1,
          at: '2026-09-17T00:00:00Z',
        },
      ],
    });
    const l = ledgerOf(view);
    expect(l.entries.some((e) => e.date === '2026-09-16')).toBe(false);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
    // Held, with the dispute that holds it: never "not billable yet".
    const day = minerDetail(view, 'solo:1')!.days.find((d) => d.date === '2026-09-16')!;
    expect(day.disputed).toEqual({ disputeId: 'd1', until: '2026-10-01T00:00:00.000Z' });
    expect(l.held).toEqual({ tax: day.tax, days: 1 });
    expect(l.notYetBilled).toEqual(ledgerOf(buildBookView(running([]))).notYetBilled);
    expect(minerDetail(view, 'solo:1')!.disputes.map((d) => d.id)).toEqual(['d1']);
  });

  it('dates an officer charge by the day picked, and keeps it owed on a day recorded paid', () => {
    const adjustments = [
      {
        id: 'c1',
        minerId: 'solo:1',
        date: '2026-09-15',
        amount: 500_000,
        reason: 'Auth rollover',
        by: 2,
        at: '2026-09-20T10:00:00Z',
      },
    ];
    const view = buildBookView({
      ...running([pay('a', 400_000, '2026-09-17T10:00:00Z')]),
      adjustments,
      minerPaidThrough: new Map([['solo:1', '2026-09-16']]),
    });
    const l = accountLedger(minerDetail(view, 'solo:1')!, adjustments);
    expect(l.entries.find((e) => e.kind === 'correction')?.date).toBe('2026-09-15');
    expect(view.miners[0].owed).toBeGreaterThan(0);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
  });

  it('ties out when a day is recorded paid with no payment behind it', () => {
    const view = buildBookView({
      ...running([]),
      minerPaidThrough: new Map([['solo:1', '2026-09-16']]),
    });
    const l = ledgerOf(view);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
  });

  it('gives each day a tolerance forgave its own dated row, tying out to the account', () => {
    // Day 15 is 100,000 and day 16 is 200,000. Paying 299,000 leaves day 16 1,000 short (0.5%).
    const view = buildBookView(running([pay('a', 299_000, '2026-09-17T10:00:00Z')]));
    const l = ledgerOf(view);
    expect(l.entries.map((e) => [e.kind, e.date, e.credit])).toEqual([
      ['day', '2026-09-15', 0],
      ['day', '2026-09-16', 0],
      ['payment', '2026-09-17', 299_000],
      ['tolerance', '2026-09-17', 1_000],
    ]);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
    expect(l.balance).toBe(0);
  });
});

describe('accountLedger from a checkpoint', () => {
  it('opens on the closed months’ balance and lists only what came after', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
        payments: [pay('old', 50_000, '2026-08-20T00:00:00Z')],
        checkpoints: new Map([
          [
            'solo:1',
            {
              minerId: 'solo:1',
              through: '2026-08-31',
              owed: [{ date: '2026-08-10', remaining: 50_000, tax: 100_000, credited: 50_000 }],
              credit: 0,
              balance: 50_000,
              paidThrough: null,
              characterIds: [1],
              at: '2026-10-01T00:00:00Z',
            },
          ],
        ]),
      })
    );
    const l = accountLedger(minerDetail(view, 'solo:1')!, []);
    expect(l.entries.map((e) => [e.kind, e.date, e.debit, e.credit, e.balance])).toEqual([
      ['checkpoint', '2026-08-31', 50_000, 0, 50_000],
      ['day', '2026-09-10', 100_000, 0, 150_000],
    ]);
    expect(l.balance).toBe(view.miners[0].owed - view.miners[0].credit);
  });
});
