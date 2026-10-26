import { describe, expect, it } from 'vitest';
import {
  computeMinerTotals,
  editScope,
  overlappingPulls,
  planTotals,
  type BookRecords,
  type MinerTotals,
  type Scope,
} from '../../../functions/src/corpTaxBookMinerTotals';
import { overdueAtFor } from '../../../functions/src/corpTaxBookEngine';
import { allocatePayments, dismissalCredits, isBeforeBook } from './allocation';
import { placeOfFactory } from './bookView';
import type { DismissableCharge, Dismissal } from './dismissals';
import { overdueStatus, type Declaration } from './overdue';
import type { Statement, StatementLine } from './statements';
import type { SyncExtraction } from './sync';

// Miner running totals (#5255, ADR 0032): totals kept by recomputing only the Miners an
// event touched must equal the client engine's full recompute, after every event.

type Data = Record<string, unknown>;

/** Small seeded generator: a failing sequence replays from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: <T>(xs: readonly T[]) => xs[int(xs.length)],
    chance: (p: number) => next() < p,
  };
}

const EXTRACTIONS: SyncExtraction[] = [
  {
    structureId: 1001,
    moonId: 31,
    extractionStartTime: '2026-09-01T00:00:00Z',
    chunkArrivalTime: '2026-09-04T00:00:00Z',
    naturalDecayTime: '2026-09-06T00:00:00Z',
    laserFiredAt: '2026-09-04T12:00:00Z',
  },
  {
    structureId: 1001,
    moonId: 32,
    extractionStartTime: '2026-09-10T00:00:00Z',
    chunkArrivalTime: '2026-09-13T00:00:00Z',
    naturalDecayTime: '2026-09-15T00:00:00Z',
  },
  {
    structureId: 1002,
    moonId: 41,
    extractionStartTime: '2026-09-02T00:00:00Z',
    chunkArrivalTime: '2026-09-06T00:00:00Z',
    naturalDecayTime: '2026-09-08T00:00:00Z',
  },
  {
    structureId: 1002,
    moonId: 42,
    extractionStartTime: '2026-09-20T00:00:00Z',
    chunkArrivalTime: '2026-09-23T00:00:00Z',
    naturalDecayTime: '2026-09-25T00:00:00Z',
  },
];

const MINERS = ['solo:1', 'solo:2', 'solo:3', 'm-a', 'm-b'];
const dayOf = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;

interface State {
  startDate: string;
  overdueDays: number;
  expiryHours: Record<string, number>;
  statements: Statement[];
  payments: (Data & { id: string })[];
  writeOffs: (Data & { id: string })[];
  dismissals: Dismissal[];
  declarations: Declaration[];
  miners: Data[];
  extractions: SyncExtraction[];
  counter: number;
}

const records = (s: State): BookRecords => ({
  startDate: s.startDate,
  overdueDays: s.overdueDays,
  expiryHours: s.expiryHours,
  dismissals: s.dismissals as unknown as Data[],
  declarations: s.declarations as unknown as Data[],
  extractions: s.extractions as unknown as Data[],
  statements: s.statements as unknown as Data[],
  payments: s.payments,
  writeOffs: s.writeOffs,
  miners: s.miners,
});

/** The client engine's full recompute of what a totals doc holds, for one Miner. */
function engineTotals(s: State, minerId: string): Partial<MinerTotals> {
  const statements = s.statements.filter((x) => x.minerId === minerId);
  const payments = s.payments
    .filter((p) => p.minerId === minerId)
    .map((p) => p as unknown as Parameters<typeof allocatePayments>[0]['payments'][number])
    .filter((p) => p.source !== 'donation' || !isBeforeBook(p.at, s.startDate));
  const placeOf = placeOfFactory(s.extractions, s.expiryHours);
  const charges: DismissableCharge[] = statements.flatMap((st) =>
    st.lines
      .filter((l) => l.chargeKey)
      .map((l) => ({
        key: l.chargeKey!,
        minerId,
        date: l.date,
        ...placeOf(l.structureId ?? 0, l.date),
      }))
  );
  const credits = dismissalCredits(statements, s.dismissals, charges);
  const allocation = allocatePayments({
    statements,
    payments,
    dismissalCredits: credits,
    officerWriteOffs: s.writeOffs
      .filter((w) => w.minerId === minerId)
      .map((w) => w as unknown as { id: string; amount: number; at: string; statementId?: string }),
    startDate: s.startDate,
  });
  let owed = 0;
  let tolerance = 0;
  let forgiven = 0;
  let overdueAt: string | null = null;
  let openDeclarations = 0;
  for (const st of statements) {
    const settlement = allocation.byStatement.get(st.id)!;
    tolerance += settlement.writtenOff;
    forgiven += settlement.forgiven;
    if (settlement.settled) continue;
    owed += settlement.remaining;
    const own = s.declarations.filter((d) => d.statementId === st.id);
    openDeclarations += own.filter((d) => !d.resolution).length;
    const at = overdueStatus({
      issuedAt: st.issuedAt,
      settled: false,
      now: '2026-12-01T00:00:00Z',
      declarations: own,
      overdueDays: s.overdueDays,
    }).overdueAt;
    if (overdueAt === null || at < overdueAt) overdueAt = at;
  }
  const lastPaid = payments
    .filter((p) => p.amount - (p.notTaxAmount ?? 0) > 0)
    .map((p) => p.at)
    .sort()
    .at(-1);
  const dayLines = statements.flatMap((st) => st.lines.filter((l) => l.chargeKey));
  return {
    statements: statements.length,
    billed: statements.reduce((sum, st) => sum + st.amount, 0),
    paid: payments.reduce((sum, p) => sum + p.amount - Math.min(p.notTaxAmount ?? 0, p.amount), 0),
    dismissed: credits.reduce((sum, c) => sum + c.amount, 0),
    toleranceWrittenOff: tolerance,
    officerWrittenOff: forgiven,
    credit: allocation.credit,
    balance: allocation.balance,
    owed,
    minedUnits: dayLines.reduce(
      (sum, l) => sum + l.oreLines.reduce((q, o) => q + o.quantity, 0),
      0
    ),
    minedValue: dayLines.reduce((sum, l) => sum + l.estimatedValue, 0),
    tax: dayLines.reduce((sum, l) => sum + l.tax, 0),
    lastPaidAt: lastPaid ?? null,
    overdueAt,
    openDeclarations,
  };
}

const COMPARED: (keyof MinerTotals)[] = [
  'statements',
  'billed',
  'paid',
  'dismissed',
  'toleranceWrittenOff',
  'officerWrittenOff',
  'credit',
  'balance',
  'owed',
  'minedUnits',
  'minedValue',
  'tax',
  'lastPaidAt',
  'overdueAt',
  'openDeclarations',
];

function freshState(): State {
  return {
    startDate: '2026-09-01',
    overdueDays: 14,
    expiryHours: {},
    statements: [],
    payments: [],
    writeOffs: [],
    dismissals: [],
    declarations: [],
    miners: [],
    extractions: EXTRACTIONS,
    counter: 0,
  };
}

type Event = { action: string } & Data;

/** One random event: the edit action, applied to the state the way the server's edit would. */
function randomEvent(r: ReturnType<typeof rng>, s: State): { event: Event; priorOwner?: string } {
  const id = (p: string) => `${p}${++s.counter}`;
  const miner = r.pick(MINERS);
  const at = (d: number) => `${dayOf(d)}T12:00:00Z`;
  switch (
    r.pick([
      'issue',
      'issue',
      'issue',
      'pay',
      'pay',
      'pay',
      'notTax',
      'assign',
      'dismiss',
      'reverse',
      'writeOff',
      'declare',
      'resolve',
      'regroup',
      'settings',
      'correct',
      'late',
    ])
  ) {
    case 'issue': {
      const n = 1 + r.int(4);
      const lines: StatementLine[] = Array.from({ length: n }, () => {
        const date = dayOf(2 + r.int(28));
        const structureId = r.pick([1001, 1002]);
        const quantity = 100 * (1 + r.int(50));
        const tax = 1000 * (1 + r.int(900));
        return {
          kind: 'mined' as const,
          date,
          chargeKey: `c${s.counter}|${date}|${structureId}|${r.int(3)}`,
          characterId: 1,
          structureId,
          oreLines: [{ typeId: 100 + r.int(3), quantity }],
          estimatedValue: tax * 10,
          taxPct: 10,
          tax,
        };
      });
      if (r.chance(0.3))
        lines.push({
          kind: 'correction',
          date: dayOf(10),
          adjustmentId: id('a'),
          oreLines: [],
          estimatedValue: 0,
          tax: r.chance(0.5) ? -5000 : 7000,
        });
      const statement: Statement = {
        id: id('s'),
        minerId: miner,
        code: 'X',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        coversFrom: '2026-09-01',
        coversThrough: '2026-09-30',
        issuedAt: `${dayOf(1 + r.int(28))}T08:00:00Z`,
        hubId: 'jita',
        oreForm: 'compressed',
        lines,
        amount: lines.reduce((sum, l) => sum + l.tax, 0),
      };
      s.statements.push(statement);
      return { event: { action: 'issueStatement', statement } };
    }
    case 'pay': {
      const source = r.pick(['donation', 'manual'] as const);
      const paymentId = id('p');
      const withMiner = r.chance(0.85);
      const statementId =
        s.statements.length && r.chance(0.3) ? r.pick(s.statements).id : undefined;
      const payment = {
        id: paymentId,
        source,
        amount: 1000 * (1 + r.int(2000)),
        at: r.chance(0.1) ? '2026-08-20T10:00:00Z' : at(2 + r.int(28)),
        ...(withMiner ? { minerId: miner } : {}),
        ...(statementId ? { statementId } : {}),
      };
      s.payments.push(payment);
      // A donation the sync matched, or an officer's recordPayment; unmatched ones touch nobody.
      return {
        event: withMiner
          ? { action: 'recordPayment', paymentId, minerId: miner }
          : { action: 'sync', minerIds: [] },
      };
    }
    case 'notTax': {
      if (!s.payments.length) return { event: { action: 'sync', minerIds: [] } };
      const p = r.pick(s.payments);
      p.notTaxAmount = r.int(Number(p.amount) + 1);
      return { event: { action: 'markNotTax', paymentId: p.id } };
    }
    case 'assign': {
      if (!s.payments.length) return { event: { action: 'sync', minerIds: [] } };
      const p = r.pick(s.payments);
      const prior = p.minerId as string | undefined;
      p.minerId = miner;
      return {
        event: { action: 'assignPayment', paymentId: p.id, minerId: miner },
        priorOwner: prior,
      };
    }
    case 'dismiss': {
      const scope = r.pick(['record', 'miner', 'moon', 'extraction'] as const);
      const line = s.statements.flatMap((st) => st.lines).find((l) => l.chargeKey && r.chance(0.3));
      const targetId =
        scope === 'miner'
          ? miner
          : scope === 'record'
            ? (line?.chargeKey ?? 'none')
            : scope === 'moon'
              ? String(r.pick(s.extractions).moonId)
              : `${r.pick(s.extractions).structureId}_${Date.parse(r.pick(s.extractions).extractionStartTime)}`;
      const d: Dismissal = {
        id: id('d'),
        scope,
        targetId,
        by: 1,
        at: `${dayOf(1 + r.int(30))}T09:00:00Z`,
        reason: 'x',
      };
      s.dismissals.push(d);
      return { event: { action: 'dismiss', scope, targetId } };
    }
    case 'reverse': {
      const d = s.dismissals.find((x) => !x.reversed);
      if (!d) return { event: { action: 'sync', minerIds: [] } };
      d.reversed = { by: 2, at: '2026-10-01T00:00:00Z' };
      return { event: { action: 'reverseDismissal', dismissalId: d.id } };
    }
    case 'writeOff': {
      const statementId =
        s.statements.length && r.chance(0.5) ? r.pick(s.statements).id : undefined;
      s.writeOffs.push({
        id: id('w'),
        minerId: miner,
        amount: 1000 * (1 + r.int(500)),
        at: at(2 + r.int(28)),
        reason: 'x',
        ...(statementId ? { statementId } : {}),
      });
      return { event: { action: 'writeOff', minerId: miner } };
    }
    case 'declare': {
      if (!s.statements.length) return { event: { action: 'sync', minerIds: [] } };
      const st = r.pick(s.statements);
      s.declarations.push({
        id: id('decl'),
        statementId: st.id,
        kind: 'contract',
        at: at(2 + r.int(28)),
      });
      return { event: { action: 'declare', statementId: st.id } };
    }
    case 'resolve': {
      const d = s.declarations.find((x) => !x.resolution);
      if (!d) return { event: { action: 'sync', minerIds: [] } };
      d.resolution = {
        kind: r.pick(['confirmed', 'rejected'] as const),
        at: '2026-10-02T00:00:00Z',
      };
      return { event: { action: 'resolveDeclaration', declarationId: d.id } };
    }
    case 'regroup': {
      const characterIds = [1 + r.int(3), 4 + r.int(3)];
      const absorb = s.miners.find((m) => m.id !== 'm-a' && r.chance(0.4));
      if (absorb) s.miners = s.miners.filter((m) => m !== absorb);
      s.miners = s.miners.filter((m) => m.id !== 'm-a');
      s.miners.push({ id: 'm-a', characterIds, mainCharacterId: characterIds[0] });
      return {
        event: {
          action: 'regroupMiner',
          minerId: 'm-a',
          characterIds,
          absorbMinerIds: absorb ? [absorb.id] : [],
        },
      };
    }
    case 'settings': {
      const patch = r.pick([
        () => {
          s.overdueDays = r.pick([7, 14, 30]);
          return { overdueDays: s.overdueDays };
        },
        () => {
          s.startDate = r.pick(['2026-09-01', '2026-09-10', '2026-08-15']);
          return { startDate: s.startDate };
        },
        () => {
          s.expiryHours = { '1001': r.pick([24, 48, 96]) };
          return { structureExpiryHours: s.expiryHours };
        },
      ])();
      return { event: { action: 'updateSettings', patch } };
    }
    case 'correct': {
      // An Extraction correction: no edit hook; the verifier repairs on its next pass.
      s.extractions = s.extractions.map((x, i) =>
        i === 0 ? { ...x, laserFiredAt: `2026-09-0${4 + r.int(2)}T12:00:00Z` } : x
      );
      return { event: { action: 'verify' } };
    }
    default: {
      // Late ore on a billed day changes no frozen total: nothing to refresh.
      return { event: { action: 'addRate' } };
    }
  }
}

/** The store's lookups for a scope's statement and payment ids, against the state. */
function resolve(scope: Scope, s: State): string[] | 'all' {
  if (scope.all) return 'all';
  const ids = new Set(scope.minerIds);
  for (const sid of scope.statementIds) {
    const statementId = sid.startsWith('declaration:')
      ? s.declarations.find((d) => d.id === sid.slice('declaration:'.length))?.statementId
      : sid;
    const st = s.statements.find((x) => x.id === statementId);
    if (st) ids.add(st.minerId);
  }
  for (const pid of scope.paymentIds) {
    const owner = s.payments.find((p) => p.id === pid)?.minerId;
    if (typeof owner === 'string') ids.add(owner);
  }
  return [...ids];
}

function assertEqualsFullRecompute(docs: Map<string, Data>, s: State, where: string) {
  const everyone = new Set<string>([
    ...s.statements.map((x) => x.minerId),
    ...s.payments.flatMap((p) => (typeof p.minerId === 'string' ? [p.minerId] : [])),
    ...s.writeOffs.map((w) => w.minerId as string),
    ...s.miners.map((m) => m.id as string),
  ]);
  expect([...docs.keys()].sort(), where).toEqual([...everyone].sort());
  for (const minerId of everyone) {
    const expected = engineTotals(s, minerId);
    const held = docs.get(minerId)!;
    for (const key of COMPARED) {
      expect(held[key], `${where}: ${minerId}.${key}`).toEqual(
        expected[key as keyof typeof expected]
      );
    }
  }
}

describe('Miner running totals', () => {
  it('equal the engine’s full recompute after every event of random sequences', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const s = freshState();
      const docs = new Map<string, Data>();
      for (let step = 0; step < 45; step++) {
        const { event, priorOwner } = randomEvent(r, s);
        let scope: string[] | 'all';
        if (event.action === 'verify') scope = 'all';
        else if (event.action === 'sync') scope = event.minerIds as string[];
        else scope = resolve(editScope(event, priorOwner), s);
        const plan = planTotals(records(s), docs, scope);
        for (const t of plan.writes) docs.set(t.minerId, t as unknown as Data);
        for (const id of plan.deletes) docs.delete(id);
        assertEqualsFullRecompute(docs, s, `seed ${seed} step ${step} ${event.action}`);
      }
    }
  });

  it('flags and repairs a total that drifted, and an orphan', () => {
    const r = rng(7);
    const s = freshState();
    const docs = new Map<string, Data>();
    for (let i = 0; i < 25; i++) randomEvent(r, s);
    for (const t of planTotals(records(s), docs, 'all').writes) docs.set(t.minerId, { ...t });
    const some = [...docs.keys()][0];
    docs.set(some, { ...docs.get(some), billed: 1 });
    docs.set('ghost', { minerId: 'ghost', billed: 5 });
    const plan = planTotals(records(s), docs, 'all');
    expect(plan.mismatches.map((m) => [m.minerId, m.kind]).sort()).toEqual(
      [
        [some, 'stale'],
        ['ghost', 'orphan'],
      ].sort()
    );
    expect(plan.mismatches.find((m) => m.minerId === some)?.fields).toEqual(['billed']);
    expect(plan.deletes).toEqual(['ghost']);
  });

  it('covers a weekly cadence: Statements of any period total the same way', () => {
    const s = freshState();
    const line = (date: string, tax: number): StatementLine => ({
      kind: 'mined',
      date,
      chargeKey: `k${date}`,
      characterId: 1,
      structureId: 1001,
      oreLines: [{ typeId: 1, quantity: 10 }],
      estimatedValue: tax * 10,
      taxPct: 10,
      tax,
    });
    for (const [i, week] of [
      ['2026-09-07', 'a'],
      ['2026-09-14', 'b'],
      ['2026-09-21', 'c'],
    ].entries()) {
      const lines = [line(week[0], 1_000_000)];
      s.statements.push({
        id: `s${i}`,
        minerId: 'solo:1',
        code: week[1],
        periodStart: week[0],
        periodEnd: week[0],
        coversFrom: week[0],
        coversThrough: week[0],
        issuedAt: `${week[0]}T08:00:00Z`,
        hubId: 'jita',
        oreForm: 'compressed',
        lines,
        amount: 1_000_000,
      });
    }
    s.payments.push({
      id: 'p1',
      minerId: 'solo:1',
      source: 'manual',
      amount: 1_500_000,
      at: '2026-09-20T00:00:00Z',
    });
    const totals = computeMinerTotals(
      {
        minerId: 'solo:1',
        statements: s.statements as unknown as Data[],
        payments: s.payments,
        writeOffs: [],
      },
      records(s)
    );
    expect(totals).toMatchObject({
      billed: 3_000_000,
      paid: 1_500_000,
      owed: 1_500_000,
      balance: 1_500_000,
      statements: 3,
    });
    expect(totals.overdueAt).toBe('2026-09-28T08:00:00.000Z');
  });

  it('mirrors the client engine’s overdue date', () => {
    const declarations: Declaration[] = [
      { id: 'd1', statementId: 's', kind: 'contract', at: '2026-09-05T00:00:00Z' },
      {
        id: 'd2',
        statementId: 's',
        kind: 'wrong-corp',
        at: '2026-09-08T00:00:00Z',
        resolution: { kind: 'rejected', at: '2026-09-20T00:00:00Z' },
      },
    ];
    for (const overdueDays of [7, 14, 30]) {
      for (const declared of [[], declarations.slice(0, 1), declarations]) {
        expect(overdueAtFor('2026-09-01T00:00:00Z', overdueDays, declared)).toBe(
          overdueStatus({
            issuedAt: '2026-09-01T00:00:00Z',
            settled: false,
            now: '2026-12-01T00:00:00Z',
            declarations: declared,
            overdueDays,
          }).overdueAt
        );
      }
    }
  });

  it('flags two pulls at one structure that cover the same day', () => {
    expect(overlappingPulls(EXTRACTIONS as unknown as Data[], {})).toEqual([]);
    const clash = [
      ...EXTRACTIONS,
      {
        ...EXTRACTIONS[0],
        extractionStartTime: '2026-09-02T00:00:00Z',
        laserFiredAt: '2026-09-05T06:00:00Z',
      },
    ];
    expect(overlappingPulls(clash as unknown as Data[], {})).toHaveLength(1);
  });
});
