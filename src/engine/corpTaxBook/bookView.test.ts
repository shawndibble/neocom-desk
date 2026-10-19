import { describe, it, expect } from 'vitest';
import {
  buildBookView,
  extractionDetail,
  minerDetail,
  nextRunPeriod,
  paymentCode,
  periodRows,
  planStatementRun,
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
      status: 'sent',
      billed: 100_000,
      outstanding: 100_000,
    });

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
