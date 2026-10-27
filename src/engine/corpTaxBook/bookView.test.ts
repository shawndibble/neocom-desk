import { describe, it, expect } from 'vitest';
import {
  buildBookView,
  extractionDetail,
  isIssuedPeriod,
  minerDetail,
  nextRunPeriod,
  paymentCode,
  periodRows,
  periodStatements,
  planStatementRun,
  statementDetail,
  statementForLine,
  type BookViewInput,
} from './bookView';
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
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [],
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    ...overrides,
  };
}

describe('buildBookView', () => {
  it('splits billable, pending and before-the-book days per Miner', () => {
    const view = buildBookView(
      input({
        entries: [
          entry(1, '2026-07-30', 5000),
          entry(1, '2026-08-10', 1000),
          entry(1, '2026-09-17', 2000),
          entry(1, '2026-09-18', 3000),
        ],
      })
    );
    expect(view.beforeBook).toHaveLength(1);
    expect(view.billableThrough).toBe('2026-09-17');
    const [miner] = view.miners;
    expect(miner.id).toBe('solo:1');
    expect(miner.unbilled).toBe(300_000);
    expect(miner.pending).toBe(300_000);
    expect(miner.owed).toBe(0);
    const detail = minerDetail(view, 'solo:1')!;
    expect(detail.days.map((d) => [d.date, d.status])).toEqual([
      ['2026-09-18', 'not-billable'],
      ['2026-09-17', 'unbilled'],
      ['2026-08-10', 'unbilled'],
    ]);
  });

  it('plans the Aug run, issues a Statement and then owes it until a donation settles it', () => {
    const base = input({ entries: [entry(1, '2026-08-10', 1000)] });
    const first = buildBookView(base);
    const period = nextRunPeriod(first)!;
    expect(period).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    const plan = planStatementRun(first, period);
    expect(plan.lines).toHaveLength(1);
    expect(plan.totalDue).toBe(100_000);
    const statement = statementForLine(first, plan, plan.lines[0]);
    expect(statement.id).toBe('2026-08-01_solo:1');
    expect(statement.characterIds).toEqual([1]);
    expect(statement.code).toBe(paymentCode(statement.id));

    const issued = buildBookView({ ...base, statements: [statement] });
    expect(issued.miners[0].owed).toBe(100_000);
    expect(issued.miners[0].unbilled).toBe(0);
    expect(issued.miners[0].overdueDays).toBe(null);
    expect(nextRunPeriod(issued)).toBeUndefined();
    expect(periodRows(issued).find((r) => r.start === '2026-08-01')).toMatchObject({
      status: 'issued',
      billed: 100_000,
      outstanding: 100_000,
    });

    const mailed = buildBookView({
      ...base,
      statements: [{ ...statement, mailsSent: 1 } as typeof statement],
    });
    expect(periodRows(mailed).find((r) => r.start === '2026-08-01')?.status).toBe('sent');

    const paid = buildBookView({
      ...base,
      statements: [statement],
      payments: [
        {
          id: 'p1',
          minerId: 'solo:1',
          characterId: 1,
          amount: 100_000,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    expect(paid.miners[0].owed).toBe(0);
    expect(periodRows(paid).find((r) => r.start === '2026-08-01')?.status).toBe('paid');
    expect(paid.miners[0].lastPaidAt).toBe('2026-09-02T00:00:00Z');
    expect(minerDetail(paid, 'solo:1')!.days[0].status).toBe('paid');
  });

  it('flags only the period whose own Statement is overdue, not a later one from the same Miner', () => {
    const base = input({
      entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
      now: '2026-09-30T00:00:00Z',
      lastSyncedAt: '2026-09-30T00:00:00Z',
    });
    const augPlan = planStatementRun(buildBookView(base), {
      start: '2026-08-01',
      end: '2026-08-31',
    });
    const aug = {
      ...statementForLine(buildBookView(base), augPlan, augPlan.lines[0]),
      issuedAt: '2026-09-01T00:00:00Z',
    };
    const afterAug = buildBookView({ ...base, statements: [aug] });
    const sepPlan = planStatementRun(afterAug, { start: '2026-09-01', end: '2026-09-30' });
    const sep = {
      ...statementForLine(afterAug, sepPlan, sepPlan.lines[0]),
      issuedAt: '2026-09-29T00:00:00Z',
    };
    const rows = periodRows(buildBookView({ ...base, statements: [aug, sep] }));
    expect(rows.find((r) => r.start === '2026-08-01')?.status).toBe('overdue');
    expect(rows.find((r) => r.start === '2026-09-01')?.status).toBe('issued');
  });

  it('lists every closed period with its own billed figure, not a running total (CX-38)', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
        now: '2026-10-05T12:00:00Z',
        lastSyncedAt: '2026-10-05T12:00:00Z',
      })
    );
    const rows = periodRows(view);
    expect(rows.find((r) => r.start === '2026-08-01')).toMatchObject({
      status: 'ready',
      billed: 100_000,
      miners: 1,
    });
    expect(rows.find((r) => r.start === '2026-09-01')).toMatchObject({
      status: 'closed',
      billed: 100_000,
      miners: 1,
    });
    expect(rows.find((r) => r.start === '2026-10-01')?.status).toBe('open');
  });

  it('keeps the ready row on the Send plan and labels a below-minimum closed period as rolling over (CX-38)', () => {
    const view = buildBookView(
      input({
        minimumStatement: 150_000,
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
        now: '2026-10-05T12:00:00Z',
        lastSyncedAt: '2026-10-05T12:00:00Z',
      })
    );
    const rows = periodRows(view);
    // Aug's own 100,000 is under the minimum: it rolls into Sep's Statement, which the ready row carries.
    expect(rows.find((r) => r.start === '2026-08-01')?.status).toBe('rollover');
    const plan = planStatementRun(view, nextRunPeriod(view)!);
    expect(rows.find((r) => r.status === 'ready')).toMatchObject({
      start: '2026-09-01',
      miners: plan.lines.length,
      billed: 200_000,
    });
  });

  it('anchors a 7-day cadence at the start date, so the days before the first 1st are billed (monthly to N-day switch)', () => {
    const view = buildBookView(
      input({
        startDate: '2026-09-25',
        cadence: { kind: 'days', days: 7, anchor: '2026-09-25' },
        entries: [entry(1, '2026-09-27', 1000), entry(1, '2026-10-03', 1000)],
        now: '2026-10-20T12:00:00Z',
        lastSyncedAt: '2026-10-20T12:00:00Z',
      })
    );
    const rows = periodRows(view);
    expect(rows.find((r) => r.start === '2026-09-25')).toMatchObject({
      end: '2026-10-01',
      billed: 100_000,
    });
    expect(rows.find((r) => r.start === '2026-10-02')).toMatchObject({ end: '2026-10-08' });
  });

  it('puts days before a later anchor in a stub period from the start date (start 25 Sep, anchor 1 Oct)', () => {
    const view = buildBookView(
      input({
        startDate: '2026-09-25',
        cadence: { kind: 'days', days: 7, anchor: '2026-10-01' },
        entries: [entry(1, '2026-09-27', 1000), entry(1, '2026-10-03', 1000)],
        now: '2026-10-20T12:00:00Z',
        lastSyncedAt: '2026-10-20T12:00:00Z',
      })
    );
    const rows = periodRows(view);
    expect(rows.find((r) => r.start === '2026-09-25')).toMatchObject({
      end: '2026-09-30',
      billed: 100_000,
    });
    expect(rows.find((r) => r.start === '2026-10-01')).toMatchObject({ end: '2026-10-07' });
  });

  it('bills the open period for its own days only (CX-38)', () => {
    const view = buildBookView(
      input({
        entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
        now: '2026-09-18T14:00:00Z',
      })
    );
    const open = periodRows(view).find((r) => r.status === 'open');
    expect(open).toMatchObject({ start: '2026-09-01', billed: 100_000 });
  });

  it('counts a donation before the start date and lists it nowhere (#4505)', () => {
    const view = buildBookView({
      ...input({ entries: [entry(1, '2026-08-10', 1000)] }),
      payments: [
        { id: 'j1', characterId: 99, amount: 7, at: '2026-07-31T23:59:59Z', source: 'donation' },
        { id: 'j2', characterId: 99, amount: 7, at: '2026-08-01T00:00:00Z', source: 'donation' },
        {
          id: 'j3',
          minerId: 'solo:1',
          characterId: 1,
          amount: 7,
          at: '2026-07-20T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    expect(view.donationsBeforeBook).toBe(2);
    expect(view.miners.find((m) => m.id === 'solo:1')?.lastPaidAt).toBeNull();
    expect(view.needsYou.map((n) => (n.kind === 'unmatched' ? n.payment.id : n.kind))).toEqual([
      'j2',
    ]);
  });

  it('flags an overdue Statement, a declaration to answer and an Unmatched donation', () => {
    const base = input({ entries: [entry(1, '2026-08-10', 1000)], now: '2026-09-30T00:00:00Z' });
    const plan0 = planStatementRun(buildBookView(base), { start: '2026-08-01', end: '2026-08-31' });
    const statement = {
      ...statementForLine(buildBookView(base), plan0, plan0.lines[0]),
      issuedAt: '2026-09-01T00:00:00Z',
    };
    const view = buildBookView({
      ...base,
      lastSyncedAt: '2026-09-30T00:00:00Z',
      statements: [statement],
      declarations: [
        { id: 'x1', statementId: statement.id, kind: 'contract', at: '2026-09-29T00:00:00Z' },
      ],
      payments: [
        { id: 'j1_9', characterId: 99, amount: 7, at: '2026-09-20T00:00:00Z', source: 'donation' },
      ],
    });
    // The declaration pauses Overdue, so there is a card to answer and no overdue card.
    expect(view.miners[0].paused).toBe(true);
    expect(view.needsYou.map((n) => n.kind)).toEqual(['declaration', 'unmatched']);

    const overdue = buildBookView({
      ...base,
      lastSyncedAt: '2026-09-30T00:00:00Z',
      statements: [statement],
    });
    expect(overdue.miners[0].overdueDays).toBe(15);
    expect(overdue.needsYou[0]).toMatchObject({ kind: 'overdue', minerId: 'solo:1', days: 15 });
    expect(overdue.totals).toMatchObject({ owed: 100_000, overdue: 100_000, overdueCount: 1 });
  });

  it('marks a Miner who is no longer a member as having left, and a stranger as a guest', () => {
    const base = input({
      entries: [entry(1, '2026-08-10', 1000), entry(2, '2026-08-10', 1000, 555)],
    });
    expect(buildBookView(base).miners.map((m) => m.standing)).toEqual(['member', 'guest']);
    const left = buildBookView({ ...base, memberIds: new Set([2]) });
    expect(left.miners.map((m) => [m.id, m.standing])).toEqual([
      ['solo:1', 'left'],
      ['solo:2', 'member'],
    ]);
  });

  it('places days on an Extraction and reports mined vs left', () => {
    const view = buildBookView(
      input({
        now: '2026-09-16T14:00:00Z',
        lastSyncedAt: '2026-09-16T12:00:00Z',
        entries: [entry(1, '2026-09-16', 600)],
        extractions: [
          {
            structureId: 1001,
            moonId: 7,
            extractionStartTime: '2026-09-01T10:00:00Z',
            chunkArrivalTime: '2026-09-15T10:00:00Z',
            naturalDecayTime: '2026-09-15T13:00:00Z',
            oreLines: [{ typeId: ORE, quantity: 1000 }],
          },
        ],
      })
    );
    const [row] = view.extractions;
    expect(row.state).toBe('fractured');
    expect(row.minedPct).toBe(60);
    expect(row.estimatedValue).toBe(1_000_000);
    expect(row.tax).toBe(60_000);
    const detail = extractionDetail(view, row.id)!;
    expect(detail.miners).toEqual([{ minerId: 'solo:1', units: 600, value: 600_000, tax: 60_000 }]);
    expect(view.charges[0].extractionId).toBe(row.id);
  });

  it('takes the ore of a chunk with no notification from its linked Survey (D13)', () => {
    const x = {
      structureId: 1001,
      moonId: 7,
      extractionStartTime: '2026-09-01T10:00:00Z',
      chunkArrivalTime: '2026-09-15T10:00:00Z',
      naturalDecayTime: '2026-09-15T13:00:00Z',
    };
    const base = {
      now: '2026-09-16T14:00:00Z',
      lastSyncedAt: '2026-09-16T12:00:00Z',
      entries: [entry(1, '2026-09-16', 500)],
      extractions: [x],
    };
    expect(buildBookView(input(base)).extractions[0]).toMatchObject({
      oreSource: 'unknown',
      oreLines: [],
    });
    const id = buildBookView(input(base)).extractions[0].id;
    const row = buildBookView(
      input({ ...base, surveyOreLines: new Map([[id, [{ typeId: ORE, quantity: 1000 }]]]) })
    ).extractions[0];
    expect(row).toMatchObject({ oreSource: 'survey', minedPct: 50, estimatedValue: 1_000_000 });
    expect(row.chunkRate).toEqual({ m3PerHour: 30_000, basis: 'default' });
    expect(
      buildBookView(
        input({
          ...base,
          chunkM3PerHour: 20_000,
          surveyOreLines: new Map([[id, [{ typeId: ORE, quantity: 1000 }]]]),
        })
      ).extractions[0].chunkRate
    ).toEqual({ m3PerHour: 20_000, basis: 'manual' });
  });

  it('learns each refinery chunk rate from its notified extractions and names it on a survey row', () => {
    // 100h at 34,000 m³/h = 340,000 units of 10 m³.
    const noted = {
      structureId: 1001,
      moonId: 7,
      extractionStartTime: '2026-08-01T00:00:00Z',
      chunkArrivalTime: '2026-08-05T04:00:00Z',
      naturalDecayTime: '2026-08-05T07:00:00Z',
      oreLines: [{ typeId: ORE, quantity: 340_000 }],
    };
    const surveyed = {
      structureId: 1001,
      moonId: 7,
      extractionStartTime: '2026-09-01T10:00:00Z',
      chunkArrivalTime: '2026-09-15T10:00:00Z',
      naturalDecayTime: '2026-09-15T13:00:00Z',
    };
    const first = buildBookView(input({ extractions: [noted, surveyed] }));
    expect(first.chunkRates.get(1001)).toEqual({ m3PerHour: 34_000, cycles: 1 });
    const id = first.extractions.find((r) => r.oreSource === 'unknown')!.id;
    const view = buildBookView(
      input({
        extractions: [noted, surveyed],
        surveyOreLines: new Map([[id, [{ typeId: ORE, quantity: 1 }]]]),
      })
    );
    expect(view.extractions.find((r) => r.id === id)?.chunkRate).toEqual({
      m3PerHour: 34_000,
      basis: 'measured',
      cycles: 1,
    });
  });
});

describe('a day on an issued Statement stays frozen (D22)', () => {
  it('keeps the Statement line price, quantity and tax when prices move; unbilled days are priced live', () => {
    const base = input({
      entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 1000)],
    });
    const first = buildBookView(base);
    const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
    const statement = statementForLine(first, plan, plan.lines[0]);
    const later = buildBookView({
      ...base,
      statements: [statement],
      pricesOn: () => ({
        prices: new Map([[ORE, 2000]]),
        sources: new Map([[ORE, 'saved' as const]]),
      }),
    });
    const days = minerDetail(later, 'solo:1')!.days;
    const billed = days.find((d) => d.date === '2026-08-10')!;
    expect(billed.status).toBe('on-statement');
    expect(billed.tax).toBe(100_000);
    expect(billed.unitPrices[ORE]).toBe(1000);
    expect(billed.estimatedValue).toBe(1_000_000);
    expect(billed.taxPct).toBe(10);
    expect(days.find((d) => d.date === '2026-09-10')!.tax).toBe(200_000);
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
    expect(view.miners[0].unbilled).toBe(200_000);
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

describe('a mixed-rate day on an issued Statement (#4618)', () => {
  it('shows the rate its lines came to, not the first line’s, and no effective-from', () => {
    const base = input({ entries: [entry(1, '2026-08-10', 1000)] });
    const first = buildBookView(base);
    const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
    const statement = statementForLine(first, plan, plan.lines[0]);
    const mined = statement.lines[0];
    // Late ore billed after a rate fix: its own line, at its own rate.
    const late = {
      ...mined,
      kind: 'late-ore' as const,
      oreLines: [{ typeId: ORE, quantity: 1000 }],
      taxPct: 20,
      rateEffectiveFrom: '2026-08-05',
      estimatedValue: 1_000_000,
      tax: 200_000,
    };
    const mixed = { ...statement, lines: [mined, late], amount: mined.tax + late.tax };
    const view = buildBookView({ ...base, statements: [mixed] });
    const day = minerDetail(view, 'solo:1')!.days[0];
    expect(day.tax).toBe(300_000);
    expect(day.estimatedValue).toBe(2_000_000);
    expect(day.taxPct).toBe(15);
    expect(day.rateEffectiveFrom).toBeUndefined();
  });
});

describe('officer write-offs (#4637)', () => {
  const base = input({
    entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-08-12', 2000)],
    memberIds: new Set(),
  });
  const first = buildBookView(base);
  const plan = planStatementRun(first, nextRunPeriod(first)!);
  const statement = statementForLine(first, plan, plan.lines[0]);
  const writeOff = (amount: number, extra: { statementId?: string } = {}) => ({
    id: 'w1',
    minerId: 'solo:1',
    amount,
    reason: 'Left the corp',
    at: '2026-09-10T00:00:00Z',
    ...extra,
  });

  it('reduces what the Miner owes, oldest days first; a day it covers in full reads written off', () => {
    const view = buildBookView({
      ...base,
      statements: [statement],
      writeOffs: [writeOff(150_000)],
    });
    expect(view.miners[0].owed).toBe(150_000);
    const detail = minerDetail(view, 'solo:1')!;
    expect(detail.days.map((d) => [d.date, d.status])).toEqual([
      ['2026-08-12', 'on-statement'],
      ['2026-08-10', 'written-off'],
    ]);
    expect(detail.officerWriteOffs).toEqual([
      { id: 'w1', amount: 150_000, reason: 'Left the corp', at: '2026-09-10T00:00:00Z' },
    ]);
  });

  it("writing off a leaver's whole balance clears it from Needs you", () => {
    const owing = buildBookView({ ...base, statements: [statement] });
    expect(owing.needsYou.some((n) => n.kind === 'leaver')).toBe(true);
    const view = buildBookView({
      ...base,
      statements: [statement],
      writeOffs: [writeOff(300_000, { statementId: statement.id })],
    });
    expect(view.miners[0].owed).toBe(0);
    expect(view.needsYou.some((n) => n.kind === 'leaver')).toBe(false);
    expect(minerDetail(view, 'solo:1')!.days.every((d) => d.status === 'written-off')).toBe(true);
  });
});

describe('period page rows (#5285)', () => {
  const base = input({
    entries: [entry(1, '2026-08-10', 10_000), entry(2, '2026-08-12', 2000)],
    now: '2026-09-30T00:00:00Z',
    lastSyncedAt: '2026-09-30T00:00:00Z',
  });
  const first = buildBookView(base);
  const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
  const [one, two] = plan.lines.map((l) => ({
    ...statementForLine(first, plan, l),
    issuedAt: '2026-09-01T00:00:00Z',
  }));

  it('counts mailed Statements and finds the earliest unpaid due date on the period row', () => {
    const view = buildBookView({
      ...base,
      statements: [{ ...one, mailsSent: 1 } as typeof one, two],
    });
    expect(periodRows(view).find((r) => r.start === '2026-08-01')).toMatchObject({
      statements: 2,
      mailed: 1,
      dueAt: '2026-09-15T00:00:00.000Z',
    });
    expect(periodRows(view).find((r) => r.status === 'open')).toMatchObject({
      statements: 0,
      mailed: 0,
      dueAt: null,
    });
  });

  it('lists each miner Statement with billed, paid, outstanding, due and mail state', () => {
    const view = buildBookView({
      ...base,
      statements: [
        { ...one, mailsSent: 2 } as typeof one,
        { ...two, mailsSent: 1, remindersStopped: true } as typeof two,
      ],
      payments: [
        {
          id: 'p1',
          minerId: one.minerId,
          characterId: 1,
          amount: 400_000,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    const page = periodStatements(view, '2026-08-01')!;
    const a = page.find((r) => r.statement.id === one.id)!;
    const b = page.find((r) => r.statement.id === two.id)!;
    expect(a).toMatchObject({
      billed: 1_000_000,
      paid: 400_000,
      outstanding: 600_000,
      settled: false,
      overdue: true,
      dueAt: '2026-09-15T00:00:00.000Z',
      mail: { kind: 'sent', count: 2 },
    });
    expect(b.mail).toEqual({ kind: 'stopped', count: 1 });
    expect(b.billed).toBe(200_000);
    expect(page.reduce((s, r) => s + r.outstanding, 0) + page.reduce((s, r) => s + r.paid, 0)).toBe(
      1_200_000
    );
    expect(periodStatements(view, '2026-07-01')).toBeUndefined();
  });

  it('reads Not mailed for a Statement nobody mailed and no due date once settled', () => {
    const view = buildBookView({
      ...base,
      statements: [one],
      payments: [
        {
          id: 'p1',
          minerId: one.minerId,
          characterId: 1,
          amount: 1_000_000,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    expect(periodStatements(view, '2026-08-01')![0]).toMatchObject({
      mail: { kind: 'not-mailed', count: 0 },
      settled: true,
      outstanding: 0,
      dueAt: null,
      overdue: false,
    });
  });
});

describe('statementDetail (#5286)', () => {
  const base = input({
    entries: [entry(1, '2026-08-10', 10_000)],
    now: '2026-09-30T00:00:00Z',
    lastSyncedAt: '2026-09-30T00:00:00Z',
  });
  const first = buildBookView(base);
  const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
  const issued = {
    ...statementForLine(first, plan, plan.lines[0]),
    issuedAt: '2026-09-01T00:00:00Z',
  };
  const pay = (id: string, amount: number, at: string) => ({
    id,
    minerId: issued.minerId,
    characterId: 1,
    amount,
    at,
    source: 'donation' as const,
  });

  it('is undefined for an id the book does not hold', () => {
    expect(
      statementDetail(buildBookView({ ...base, statements: [issued] }), 'nope')
    ).toBeUndefined();
  });

  it('reports billed, credited and remaining that add up, with the payments credited to it', () => {
    const view = buildBookView({
      ...base,
      statements: [issued],
      payments: [
        pay('p1', 300_000, '2026-09-02T00:00:00Z'),
        pay('p2', 100_000, '2026-09-05T00:00:00Z'),
      ],
    });
    const detail = statementDetail(view, issued.id)!;
    expect(detail).toMatchObject({
      billed: issued.amount,
      credited: 400_000,
      forgiven: 0,
      writtenOff: 0,
      remaining: issued.amount - 400_000,
      state: 'overdue',
    });
    expect(detail.payments).toEqual([
      { id: 'p1', amount: 300_000, at: '2026-09-02T00:00:00Z', source: 'donation' },
      { id: 'p2', amount: 100_000, at: '2026-09-05T00:00:00Z', source: 'donation' },
    ]);
  });

  it('shows only the part of a payment that went to this Statement', () => {
    const view = buildBookView({
      ...base,
      statements: [issued],
      payments: [pay('p1', issued.amount + 50_000, '2026-09-02T00:00:00Z')],
    });
    const detail = statementDetail(view, issued.id)!;
    expect(detail.payments).toEqual([
      { id: 'p1', amount: issued.amount, at: '2026-09-02T00:00:00Z', source: 'donation' },
    ]);
    expect(detail).toMatchObject({ settled: true, remaining: 0, state: 'settled' });
  });

  it('reads paused while a declaration holds the Overdue clock', () => {
    const view = buildBookView({
      ...base,
      statements: [issued],
      declarations: [
        { id: 'd1', statementId: issued.id, kind: 'contract', at: '2026-09-20T00:00:00Z' },
      ],
    });
    expect(statementDetail(view, issued.id)).toMatchObject({
      state: 'paused',
      pausedUntil: '2026-10-04T00:00:00.000Z',
    });
  });
});

describe('Statement standings read as whole ISK and Due skips paused ones (#5247)', () => {
  const base = input({
    entries: [entry(1, '2026-08-10', 10_000), entry(2, '2026-08-11', 10_000)],
    now: '2026-09-30T00:00:00Z',
    lastSyncedAt: '2026-09-30T00:00:00Z',
  });
  const first = buildBookView(base);
  const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
  const [a, b] = plan.lines.map((l) => ({
    ...statementForLine(first, plan, l),
    issuedAt: '2026-09-01T00:00:00Z',
  }));

  it('a paused Statement does not set the period Due; the pause end shows when all are paused', () => {
    const declare = (id: string) => ({
      id: `d-${id}`,
      statementId: id,
      kind: 'contract' as const,
      at: '2026-09-25T00:00:00Z',
    });
    const one = buildBookView({ ...base, statements: [a, b], declarations: [declare(a.id)] });
    expect(periodRows(one).find((r) => r.start === '2026-08-01')).toMatchObject({
      dueAt: '2026-09-15T00:00:00.000Z',
      pausedUntil: null,
    });
    const both = buildBookView({
      ...base,
      statements: [a, b],
      declarations: [declare(a.id), declare(b.id)],
    });
    expect(periodRows(both).find((r) => r.start === '2026-08-01')).toMatchObject({
      dueAt: null,
      pausedUntil: '2026-10-09T00:00:00.000Z',
    });
  });

  it('an unsettled Statement with no settlement still owes its whole amount', () => {
    const view = buildBookView({ ...base, statements: [a] });
    const row = periodStatements(view, '2026-08-01')![0];
    expect(row.outstanding).toBe(statementDetail(view, a.id)!.remaining);
    expect(row.outstanding).toBe(a.amount);
  });

  it('shows whole ISK: Billed - Paid - Outstanding is 0 and a sub-ISK left-over is not owed', () => {
    const fractional = { ...a, amount: 1_000_000.6 };
    const view = buildBookView({
      ...base,
      statements: [fractional],
      payments: [
        {
          id: 'p1',
          minerId: a.minerId,
          characterId: 1,
          amount: 1_000_000,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    const row = periodStatements(view, '2026-08-01')![0];
    expect(row).toMatchObject({ billed: 1_000_001, paid: 1_000_001, outstanding: 0 });
    expect(row.billed - row.paid - row.outstanding).toBe(0);
    const detail = statementDetail(view, fractional.id)!;
    expect(detail.remaining).toBe(0);
    expect(detail.credited + detail.writtenOff + detail.remaining).toBe(row.billed);
    expect(detail.payments).toEqual([
      { id: 'p1', amount: 1_000_000, at: '2026-09-02T00:00:00Z', source: 'donation' },
    ]);
  });

  it('lists only payments that put at least 1 ISK on the Statement', () => {
    const view = buildBookView({
      ...base,
      statements: [a],
      payments: [
        {
          id: 'p1',
          minerId: a.minerId,
          characterId: 1,
          amount: a.amount + 0.4,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    expect(statementDetail(view, a.id)!.payments.map((p) => p.id)).toEqual(['p1']);
    expect(isIssuedPeriod({ statements: 1 })).toBe(true);
    expect(isIssuedPeriod({ statements: 0 })).toBe(false);
  });

  it('panel arithmetic: credited, forgiven and written off add up to billed minus remaining', () => {
    const view = buildBookView({
      ...base,
      statements: [a],
      payments: [
        {
          id: 'p1',
          minerId: a.minerId,
          characterId: 1,
          amount: a.amount - 150_000 - 50_000,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
      writeOffs: [
        { id: 'w1', minerId: a.minerId, amount: 150_000, at: '2026-09-10T00:00:00Z', reason: 'x' },
      ],
    });
    const d = statementDetail(view, a.id)!;
    expect(d.forgiven).toBe(150_000);
    expect(d.writtenOff).toBe(50_000);
    expect(d.remaining).toBe(0);
    expect(d.credited - d.forgiven + d.forgiven + d.writtenOff + d.remaining).toBe(d.billed);
  });

  it('a sub-ISK credit is not a payment: nothing paid, all of it outstanding', () => {
    const fractional = { ...a, amount: 1_000_000.6 };
    const view = buildBookView({
      ...base,
      statements: [fractional],
      payments: [
        {
          id: 'p1',
          minerId: a.minerId,
          characterId: 1,
          amount: 0.4,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    expect(periodStatements(view, '2026-08-01')![0]).toMatchObject({
      billed: 1_000_001,
      paid: 0,
      outstanding: 1_000_001,
    });
  });
});
