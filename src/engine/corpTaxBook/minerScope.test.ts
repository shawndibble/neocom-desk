import { describe, expect, it } from 'vitest';
import {
  computeMinerTotals,
  type MinerTotals,
} from '../../../functions/src/corpTaxBookMinerTotals';
import {
  buildBookView,
  minerDetail,
  planStatementRun,
  statementForLine,
  type BookViewInput,
} from './bookView';
import { daysByPhase, minerMoons, oreTaxLines } from './bookSections';
import { groupObservedEntries } from './observed';
import { frozenRows, minerScopedRows, openWindowStart, withMinerTotals } from './minerScope';
import type { Dismissal } from './dismissals';
import type { Adjustment, Statement } from './statements';
import type { SettlePayment, SyncExtraction } from './sync';
import type { ObservedRow } from './types';

const CORP = 98000001;
const TRITA = 45490;
const XENO = 45491;
const MINER = 'm1';

function row(
  characterId: number,
  date: string,
  typeId: number,
  quantity: number,
  structureId = 1001
): ObservedRow {
  return {
    structureId,
    characterId,
    recordedCorporationId: CORP,
    typeId,
    date,
    quantity,
    cachedAt: `${date}T23:00:00Z`,
  };
}

const EXTRACTIONS: SyncExtraction[] = [
  {
    structureId: 1001,
    moonId: 31,
    extractionStartTime: '2026-08-05T00:00:00Z',
    chunkArrivalTime: '2026-08-08T00:00:00Z',
    naturalDecayTime: '2026-08-12T00:00:00Z',
  },
  {
    structureId: 1001,
    moonId: 32,
    extractionStartTime: '2026-09-05T00:00:00Z',
    chunkArrivalTime: '2026-09-08T00:00:00Z',
    naturalDecayTime: '2026-09-12T00:00:00Z',
  },
];

// Two characters of one Miner, a second Miner, two refineries, two ores.
const ROWS: ObservedRow[] = [
  row(1, '2026-08-10', TRITA, 1000),
  row(1, '2026-08-10', XENO, 400),
  row(11, '2026-08-20', TRITA, 700, 1002),
  row(1, '2026-09-10', TRITA, 1500),
  row(11, '2026-09-10', XENO, 300),
  row(1, '2026-09-16', TRITA, 900),
  row(1, '2026-09-17', TRITA, 2000),
  row(1, '2026-09-18', TRITA, 3000),
  row(2, '2026-09-10', TRITA, 5000),
  row(2, '2026-09-17', TRITA, 800),
];

const prices = (date: string) => ({
  prices: new Map([
    [TRITA, 1000 + Number(date.slice(8))],
    [XENO, 2000],
  ]),
  sources: new Map([
    [TRITA, 'saved' as const],
    [XENO, 'saved' as const],
  ]),
});

function base(overrides: Partial<BookViewInput> = {}): BookViewInput {
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
    entries: groupObservedEntries(ROWS),
    miners: [{ id: MINER, characterIds: [1, 11], mainCharacterId: 1 }],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: EXTRACTIONS,
    paidStatementIds: new Set(),
    pricesOn: prices,
    ...overrides,
  };
}

/** Issues Aug then Sep through the engine's own run planner, as an officer would. */
function issue(): { statements: Statement[] } {
  const statements: Statement[] = [];
  let input = base();
  for (const [period, at] of [
    [{ start: '2026-08-01', end: '2026-08-31' }, '2026-09-01T00:00:00Z'],
    [{ start: '2026-09-01', end: '2026-09-12' }, '2026-09-13T00:00:00Z'],
  ] as const) {
    const view = buildBookView(input);
    const plan = planStatementRun(view, period);
    for (const line of plan.lines.filter((l) => l.minerId === MINER))
      statements.push({ ...statementForLine(view, plan, line), issuedAt: at });
    input = base({ statements });
  }
  return { statements };
}

const PAYMENTS: SettlePayment[] = [
  {
    id: 'p1',
    minerId: MINER,
    characterId: 1,
    amount: 50_000,
    at: '2026-09-05T00:00:00Z',
    source: 'donation',
  },
  {
    id: 'p2',
    minerId: MINER,
    characterId: 1,
    amount: 210_000,
    at: '2026-09-19T00:00:00Z',
    source: 'manual',
  },
  { id: 'p3', characterId: 99, amount: 5, at: '2026-09-06T00:00:00Z', source: 'donation' },
];
const DISMISSALS: Dismissal[] = [
  {
    id: 'd1',
    scope: 'record',
    targetId: '1:1001:2026-09-16',
    by: 7,
    at: '2026-09-18T00:00:00Z',
    reason: 'test',
  },
];
const ADJUSTMENTS: Adjustment[] = [
  {
    id: 'a1',
    minerId: MINER,
    date: '2026-08-10',
    amount: -5000,
    reason: 'oops',
    by: 7,
    at: '2026-09-18T01:00:00Z',
  },
];

/** The book as the old path holds it, and as the Miner page's read-model path holds it. */
function both() {
  const { statements } = issue();
  const mine = statements.filter((s) => s.minerId === MINER);
  const common = {
    statements: mine,
    payments: PAYMENTS.filter((p) => p.minerId === MINER),
    dismissals: DISMISSALS,
    adjustments: ADJUSTMENTS,
  };
  const old = buildBookView(base({ ...common, payments: PAYMENTS }));
  const from = openWindowStart(mine, '2026-08-01');
  const window = ROWS.filter((r) => [1, 11].includes(r.characterId) && r.date >= from);
  const rows = minerScopedRows(mine, window, { corpFor: () => CORP });
  const scoped = buildBookView(
    base({
      ...common,
      entries: groupObservedEntries(rows),
      // Only the open window's days are priced: a frozen day needs no price.
      pricesOn: (d) => (d >= from ? prices(d) : { prices: new Map(), sources: new Map() }),
    })
  );
  return { old, scoped, mine, from };
}

describe('Miner page read-model path', () => {
  it('shows the same figures as the whole-book path (parity)', () => {
    const { old, scoped } = both();
    const a = minerDetail(old, MINER)!;
    const b = minerDetail(scoped, MINER)!;
    // The header, every section's rows, the payments footer and the Statement links.
    expect(b.row).toEqual(a.row);
    expect(b.days).toEqual(a.days);
    expect(b.payments).toEqual(a.payments);
    expect(b.statements).toEqual(a.statements);
    expect(b.paymentCredits).toEqual(a.paymentCredits);
    expect(b.toleranceWriteOffs).toEqual(a.toleranceWriteOffs);
    expect(b.lateWriteOffs).toEqual(a.lateWriteOffs);
    expect(b.officerWriteOffs).toEqual(a.officerWriteOffs);
    expect(b.dismissals).toEqual(a.dismissals);
    expect(b.credit).toBe(a.credit);
    expect(daysByPhase(b.days)).toEqual(daysByPhase(a.days));
    expect(minerMoons(scoped, MINER)).toEqual(minerMoons(old, MINER));
    for (const m of minerMoons(old, MINER))
      expect(oreTaxLines(b.days.filter((d) => d.structureId === m.structureId))).toEqual(m.lines);
  });

  it('has real content to compare: both phases, paid and open Statements, two moons', () => {
    const { old } = both();
    const d = minerDetail(old, MINER)!;
    const phases = daysByPhase(d.days);
    expect(phases.nextStatement.length).toBeGreaterThan(0);
    expect(phases.stillAccruing.length).toBeGreaterThan(0);
    expect(d.days.map((x) => x.status)).toEqual(
      expect.arrayContaining(['paid', 'on-statement', 'dismissed'])
    );
    expect(d.statements).toHaveLength(2);
    expect(new Set(minerMoons(old, MINER).map((m) => m.structureId)).size).toBe(2);
  });

  it('needs no ledger row before the newest Statement but its own window', () => {
    const { mine, from } = both();
    expect(from).toBe(mine.reduce((m, s) => (s.coversFrom > m ? s.coversFrom : m), ''));
    expect(openWindowStart([], '2026-08-01')).toBe('2026-08-01');
  });

  it('rebuilds a frozen day from its Statement lines, once, ore by ore', () => {
    const { mine } = both();
    const rows = frozenRows(mine, { corpFor: () => CORP, skip: new Set() });
    const aug10 = rows.filter((r) => r.date === '2026-08-10' && r.characterId === 1);
    expect(aug10.map((r) => [r.typeId, r.quantity]).sort()).toEqual([
      [TRITA, 1000],
      [XENO, 400],
    ]);
    // A day the open window already holds is taken from the ledger, not twice.
    expect(
      frozenRows(mine, { corpFor: () => CORP, skip: new Set(['1:1001:2026-08-10']) })
    ).toHaveLength(rows.length - 2);
  });

  it('header totals from the miner doc equal the computed row', () => {
    const { old, mine } = both();
    const totals = computeMinerTotals(
      {
        minerId: MINER,
        miner: { characterIds: [1, 11], mainCharacterId: 1 },
        statements: mine as never,
        payments: PAYMENTS.filter((p) => p.minerId === MINER) as never,
        writeOffs: [],
      },
      {
        startDate: '2026-08-01',
        overdueDays: 14,
        expiryHours: {},
        dismissals: DISMISSALS as never,
        declarations: [],
        extractions: EXTRACTIONS as never,
      }
    ) as MinerTotals;
    const row = minerDetail(old, MINER)!.row;
    expect(totals.owed).toBe(row.owed);
    expect(totals.credit).toBe(row.credit);
    expect(totals.lastPaidAt).toBe(row.lastPaidAt);
    // The doc, applied to the view, leaves the figures as they were.
    expect(minerDetail(withMinerTotals(old, MINER, totals), MINER)!.row).toEqual(row);
  });

  it('takes owed, credit and last payment from a stored doc, and ignores a doc of another schema', () => {
    const { old } = both();
    const row = minerDetail(old, MINER)!.row;
    const doc = {
      schema: 1,
      owed: 123,
      credit: 4,
      lastPaidAt: '2026-01-01T00:00:00Z',
    } as MinerTotals;
    expect(minerDetail(withMinerTotals(old, MINER, doc), MINER)!.row).toMatchObject({
      owed: 123,
      credit: 4,
      lastPaidAt: '2026-01-01T00:00:00Z',
    });
    expect(withMinerTotals(old, MINER, { ...doc, schema: 99 })).toBe(old);
    expect(withMinerTotals(old, MINER, { ...doc, owed: NaN })).toBe(old);
    expect(withMinerTotals(old, MINER, undefined)).toBe(old);
    expect(minerDetail(old, MINER)!.row).toEqual(row);
  });
});
