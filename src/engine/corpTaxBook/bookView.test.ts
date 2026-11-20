import { describe, it, expect } from 'vitest';
import { accountLedger } from './accountLedger';
import {
  buildBookView,
  type BookView,
  type PlannedRun,
  duePeriods,
  extractionDetail,
  minerDetail,
  nextRunPeriod,
  paymentCode,
  periodStatements,
  planStatementRun,
  planStatementRuns,
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

  describe('on a running account', () => {
    const pay = (amount: number, at = '2026-09-18T10:00:00Z') => ({
      id: `p${amount}`,
      minerId: 'solo:1',
      characterId: 1,
      amount,
      at,
      source: 'donation' as const,
    });
    const running = (over: Partial<BookViewInput> = {}) =>
      input({
        runningAccountFrom: '2026-08-01T00:00:00Z',
        entries: [
          entry(1, '2026-09-15', 1000),
          entry(1, '2026-09-16', 2000),
          entry(1, '2026-09-18', 500),
        ],
        ...over,
      });

    it('owes every Billable day at once, with nothing waiting for a Statement', () => {
      const [miner] = buildBookView(running()).miners;
      expect(miner.unbilled).toBe(0);
      expect(miner.owed).toBe(300_000);
      expect(miner.pending).toBe(50_000);
      expect(miner.account).toEqual({
        paidThrough: null,
        owes: { amount: 300_000, days: 2, oldest: '2026-09-15' },
        closableThrough: null,
      });
    });

    it('offers to store a paid day only when its prices are saved close-of-day prices', () => {
      const paid = { payments: [pay(350_000)] };
      expect(buildBookView(running(paid)).miners[0].account?.closableThrough).toBe('2026-09-16');
      const live = buildBookView(
        running({
          ...paid,
          pricesOn: () => ({
            prices: new Map([[ORE, 1000]]),
            sources: new Map([[ORE, 'live' as const]]),
          }),
        })
      );
      expect(live.miners[0].account?.closableThrough).toBeNull();
    });

    it('keeps a stored paid-through day paid when its payment is marked "not tax"', () => {
      const notTax = { ...pay(350_000), notTaxAmount: 350_000 };
      const unstored = buildBookView(running({ payments: [notTax] }));
      expect(unstored.miners[0].account?.paidThrough).toBeNull();
      const stored = buildBookView(
        running({ payments: [notTax], minerPaidThrough: new Map([['solo:1', '2026-09-16']]) })
      );
      expect(stored.miners[0].account?.paidThrough).toBe('2026-09-16');
      expect(stored.miners[0].owed).toBe(0);
    });

    it('marks the days a payment covered paid, oldest first, and holds only an overpayment as credit', () => {
      const view = buildBookView(running({ payments: [pay(100_000)] }));
      expect(view.miners[0].account?.paidThrough).toBe('2026-09-15');
      expect(minerDetail(view, 'solo:1')!.days.map((d) => [d.date, d.status])).toEqual([
        ['2026-09-18', 'not-billable'],
        ['2026-09-16', 'unbilled'],
        ['2026-09-15', 'paid'],
      ]);
      const owing = minerDetail(view, 'solo:1')!.days.find((d) => d.date === '2026-09-16');
      expect(owing?.owed).toBe(200_000);
      const ahead = buildBookView(running({ payments: [pay(350_000)] }));
      expect(ahead.miners[0]).toMatchObject({ owed: 0, credit: 50_000 });
      expect(ahead.miners[0].account).toMatchObject({ paidThrough: '2026-09-16', owes: null });
      expect(ahead.totals.unbilled).toBe(0);
    });

    it('leaves a calendar book as it was', () => {
      expect(
        buildBookView(input({ entries: [entry(1, '2026-09-15', 1000)] })).miners[0].account
      ).toBeUndefined();
    });
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
    expect(paid.miners[0].lastPaidAt).toBe('2026-09-02T00:00:00Z');
    expect(minerDetail(paid, 'solo:1')!.days[0].status).toBe('paid');
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

describe('a held moon owner day and a paid Statement (#6209)', () => {
  const FEEDER = 98000002;
  const fed = (characterId: number, date: string, quantity: number) => ({
    ...entry(characterId, date, quantity),
    structureId: 2002,
    sourceCorporationId: FEEDER,
  });

  it('a day held while the moon owner could not be read is billed later, never written off', () => {
    const entries = [entry(1, '2026-08-05', 1000), fed(1, '2026-08-20', 1000)];
    // The moon owner's ledger was last read well on 08-15: its 08-20 ore is held.
    const held = input({
      entries,
      feeders: [{ corporationId: FEEDER, lastReadWellAt: '2026-08-15T00:00:00Z' }],
    });
    const first = buildBookView(held);
    const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
    const statement = statementForLine(first, plan, plan.lines[0]);
    // The read comes back and the Statement is paid.
    const later = buildBookView({
      ...held,
      feeders: [{ corporationId: FEEDER, lastReadWellAt: '2026-09-18T10:00:00Z' }],
      statements: [statement],
      paidStatementIds: new Set([statement.id]),
    });
    const miner = minerDetail(later, 'solo:1')!;
    expect(miner.lateWriteOffs).toEqual([]);
    expect(miner.days.find((d) => d.date === '2026-08-20')?.status).toBe('unbilled');
  });

  it("holds a stale owner's miner before its ore is read at all, so it lands later, not written off", () => {
    // Miner 1 mined at the moon owner on 08-10 (read) and at the book's own refinery on 08-20;
    // the owner's 08-20 ore is read only after the August Statement was paid.
    const own = entry(1, '2026-08-20', 1000);
    const stale = input({
      entries: [fed(1, '2026-08-10', 1000), own],
      feeders: [{ corporationId: FEEDER, lastReadWellAt: '2026-08-15T10:00:00Z' }],
    });
    const first = buildBookView(stale);
    const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
    const statement = statementForLine(first, plan, plan.lines[0]);
    expect(statement.coversThrough < '2026-08-15').toBe(true);
    const later = buildBookView({
      ...stale,
      entries: [fed(1, '2026-08-10', 1000), own, fed(1, '2026-08-20', 500)],
      feeders: [{ corporationId: FEEDER, lastReadWellAt: '2026-09-18T10:00:00Z' }],
      statements: [statement],
      paidStatementIds: new Set([statement.id]),
    });
    expect(minerDetail(later, 'solo:1')!.lateWriteOffs).toEqual([]);
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

describe('Statement standings read as whole ISK (#5247)', () => {
  const base = input({
    entries: [entry(1, '2026-08-10', 10_000), entry(2, '2026-08-11', 10_000)],
    now: '2026-09-30T00:00:00Z',
    lastSyncedAt: '2026-09-30T00:00:00Z',
  });
  const first = buildBookView(base);
  const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-08-31' });
  const [a] = plan.lines.map((l) => ({
    ...statementForLine(first, plan, l),
    issuedAt: '2026-09-01T00:00:00Z',
  }));

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

  it('panel Credited plus written off and remaining is Billed (whole ISK, never off by 1)', () => {
    const fractional = { ...a, amount: 1000.6 };
    const view = buildBookView({
      ...base,
      statements: [fractional],
      payments: [
        {
          id: 'p1',
          minerId: a.minerId,
          characterId: 1,
          amount: 400.3,
          at: '2026-09-02T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    const row = periodStatements(view, '2026-08-01')![0];
    const detail = statementDetail(view, fractional.id)!;
    expect(detail.credited + detail.writtenOff + detail.remaining).toBe(row.billed);
    expect(detail.credited).toBe(401);
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

  it('a partial write-off with no payment lowers Outstanding on the table, the period rows and the panel (#5310)', () => {
    const view = buildBookView({
      ...base,
      statements: [a],
      writeOffs: [
        { id: 'w1', minerId: a.minerId, amount: 150_000, at: '2026-09-10T00:00:00Z', reason: 'x' },
      ],
    });
    const left = a.amount - 150_000;
    expect(periodStatements(view, '2026-08-01')![0]).toMatchObject({
      billed: a.amount,
      paid: 150_000,
      outstanding: left,
      settled: false,
    });
    const d = statementDetail(view, a.id)!;
    expect(d).toMatchObject({ forgiven: 150_000, writtenOff: 0, remaining: left });
    expect(d.billed - d.credited - d.remaining).toBe(0);
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

describe('planStatementRuns: every missed period in one run (#6208)', () => {
  const late = input({
    now: '2026-10-18T14:00:00Z',
    lastSyncedAt: '2026-10-18T12:00:00Z',
    entries: [entry(1, '2026-08-10', 1000), entry(1, '2026-09-10', 2000)],
  });

  it('plans Aug then Sep, the second carrying what the first bills', () => {
    const runs = planStatementRuns(buildBookView(late));
    expect(runs.map((r) => r.plan.period.start)).toEqual(['2026-08-01', '2026-09-01']);
    const [aug, sep] = runs;
    expect(aug.plan.lines[0]).toMatchObject({ carried: 0, balanceDue: 100_000 });
    expect(sep.plan.lines[0]).toMatchObject({ carried: 100_000, balanceDue: 300_000 });
    expect(duePeriods(buildBookView(late))).toEqual([
      { start: '2026-08-01', end: '2026-08-31' },
      { start: '2026-09-01', end: '2026-09-30' },
    ]);
  });

  it('issues each period from its own view, so ids follow the period', () => {
    const runs = planStatementRuns(buildBookView(late));
    const ids = runs.map((r) => statementForLine(r.view, r.plan, r.plan.lines[0]).id);
    expect(ids).toEqual(['2026-08-01_solo:1', '2026-09-01_solo:1']);
  });

  it('leaves out a period already on a Statement and returns nothing once all are issued', () => {
    const first = buildBookView(late);
    const [aug] = planStatementRuns(first);
    const augStatement = statementForLine(aug.view, aug.plan, aug.plan.lines[0]);
    const afterAug = buildBookView({ ...late, statements: [augStatement] });
    expect(duePeriods(afterAug)).toEqual([{ start: '2026-09-01', end: '2026-09-30' }]);
    const [sep] = planStatementRuns(afterAug);
    const sepStatement = statementForLine(sep.view, sep.plan, sep.plan.lines[0]);
    expect(
      planStatementRuns(buildBookView({ ...late, statements: [augStatement, sepStatement] }))
    ).toEqual([]);
  });

  it('rolls a period under the minimum into the next one', () => {
    const view = buildBookView({ ...late, minimumStatement: 150_000 });
    const runs = planStatementRuns(view);
    expect(runs.map((r) => r.plan.period.start)).toEqual(['2026-09-01']);
    expect(runs[0].plan.lines[0].draft.amount).toBe(300_000);
  });

  it('is empty when nothing has closed', () => {
    expect(planStatementRuns(buildBookView(input()))).toEqual([]);
    expect(duePeriods(buildBookView(input()))).toEqual([]);
  });
});

describe('planStatementRuns: the same plan as re-planning every period from the start', () => {
  /** The plan as #6208 first computed it: `nextRunPeriod` from scratch on each period's view. */
  function reference(view: BookView): PlannedRun[] {
    const runs: PlannedRun[] = [];
    const seen = new Set<string>();
    let current = view;
    for (;;) {
      const period = nextRunPeriod(current);
      if (period === undefined || seen.has(period.start)) return runs;
      seen.add(period.start);
      const plan = planStatementRun(current, period);
      runs.push({ plan, view: current });
      const issued = plan.lines.map((line) => statementForLine(current, plan, line));
      current = buildBookView({
        ...current.input,
        statements: [...current.input.statements, ...issued],
      });
    }
  }
  const plans = (runs: PlannedRun[]) =>
    runs.map((r) => ({ plan: r.plan, statements: r.view.input.statements.map((s) => s.id) }));

  const late = input({
    now: '2026-12-18T14:00:00Z',
    lastSyncedAt: '2026-12-18T12:00:00Z',
    entries: [
      entry(1, '2026-08-10', 1000),
      entry(2, '2026-08-20', 300),
      entry(1, '2026-09-10', 2000),
      entry(3, '2026-10-02', 50),
      entry(2, '2026-10-12', 4000),
      entry(1, '2026-11-30', 700),
      entry(3, '2026-12-01', 900),
    ],
  });
  const issuedAug = (() => {
    const view = buildBookView(late);
    const [aug] = planStatementRuns(view);
    return aug.plan.lines
      .filter((l) => l.minerId === 'solo:1')
      .map((l) => statementForLine(aug.view, aug.plan, l));
  })();

  const cases: [string, BookViewInput][] = [
    ['several missed months, several miners', late],
    ['under a minimum that rolls some months over', { ...late, minimumStatement: 150_000 }],
    ['a 10-day cadence', { ...late, cadence: { kind: 'days', days: 10, anchor: '2026-08-01' } }],
    ['a miner new to a month already issued for another', { ...late, statements: issuedAug }],
    ['nothing closed yet', input()],
  ];
  it.each(cases)('%s', (_name, bookInput) => {
    const view = buildBookView(bookInput);
    const runs = planStatementRuns(view);
    expect(plans(runs)).toEqual(plans(reference(view)));
    expect(duePeriods(view)).toEqual(runs.map((r) => r.plan.period));
    expect(nextRunPeriod(view)).toEqual(runs[0]?.plan.period);
  });

  it('plans the first period on the view it was given', () => {
    const view = buildBookView(late);
    expect(planStatementRuns(view)[0].view).toBe(view);
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
      runningAccountFrom: '2026-08-01T00:00:00Z',
      entries: [
        entry(1, '2026-09-15', 1000),
        entry(1, '2026-09-16', 2000),
        entry(1, '2026-09-18', 500),
      ],
      payments,
    });
  const ledgerOf = (v: BookView) => accountLedger(minerDetail(v, 'solo:1')!, [], true);

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

  it('ties a legacy Statement settled within tolerance out with its own row', () => {
    const base = input({ entries: [entry(1, '2026-08-10', 1000)] });
    const first = buildBookView(base);
    const plan = planStatementRun(first, nextRunPeriod(first)!);
    const statement = statementForLine(first, plan, plan.lines[0]);
    const view = buildBookView({
      ...base,
      statements: [statement],
      payments: [pay('a', 99_700, '2026-09-10T00:00:00Z')],
    });
    const l = accountLedger(minerDetail(view, 'solo:1')!, [], false);
    expect(l.entries.map((e) => [e.kind, e.credit])).toEqual([
      ['day', 0],
      ['payment', 99_700],
      ['tolerance', 300],
    ]);
    expect(l.balance).toBe(0);
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
    const l = accountLedger(minerDetail(view, 'solo:1')!, [reversed], true);
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
    const rows = accountLedger(detail, [adjustment], true).entries;
    expect(rows.find((e) => e.kind === 'correction')).toMatchObject({
      refId: 'c1',
      opening: true,
    });
    expect(rows.find((e) => e.kind === 'correction')?.locked).toBeUndefined();
    expect(rows.find((e) => e.kind === 'tolerance')?.forDate).toBe('2026-09-15');
    // A Statement that billed the correction freezes it.
    const billed = {
      ...detail,
      statements: [{ id: 's1', lines: [{ kind: 'correction', adjustmentId: 'c1' }] } as never],
    };
    expect(
      accountLedger(billed, [adjustment], true).entries.find((e) => e.kind === 'correction')?.locked
    ).toBe(true);
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
    const l = accountLedger(minerDetail(view, 'solo:1')!, [], true);
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
    const l = accountLedger(minerDetail(view, 'solo:1')!, [], true);
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
    const l = accountLedger(minerDetail(view, 'solo:1')!, adjustments, true);
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
