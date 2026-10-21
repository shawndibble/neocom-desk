import { describe, expect, it } from 'vitest';
import * as mirror from '../../../functions/src/corpTaxBookEngine';
import { allocatePayments, dismissalCredits } from './allocation';
import { placeOfFactory } from './bookView';
import { FORFEIT_NO_REPLY_DAYS, forfeitAllowed } from './closeAccount';
import type { Dismissal } from './dismissals';
import { extractionId, type SyncExtraction } from './sync';
import { closePeriod, isDayCovered, reopenPeriod } from './coverage';
import { oreFormTypeId } from '../miningTax/oreForm';
import {
  FEEDER_DISCONNECT_DAYS,
  advanceFeederHealth,
  disconnectedCoverage,
  type FeederHealth,
} from './feederHealth';
import { accrueValuedDays, feederBalance, onPayList } from './feederAccrual';
import { DEFAULT_GRACE_HOURS, dayClosesAt } from './billable';
import { DEFAULT_OVERDUE_DAYS } from './overdue';
import { mergeObservedRows, observedRowKey } from './observed';
import { canOverrideRecordRate, isRetroactiveRate } from './rates';
import {
  DEFAULT_MINIMUM_STATEMENT,
  canRebillFrom,
  daysOnStatements,
  statementDays,
  type Statement,
} from './statements';
import type { ObservedRow } from './types';
import * as removal from './removal';

// `functions/` cannot import `src/`, so the callables enforce a mirror of these
// engine functions (functions/src/corpTaxBookEngine.ts). This keeps the two
// from drifting: same inputs, same outputs.
const row = (quantity: number, cachedAt: string, over: Partial<ObservedRow> = {}): ObservedRow => ({
  structureId: 1,
  characterId: 2,
  recordedCorporationId: 3,
  typeId: 4,
  date: '2026-07-12',
  quantity,
  cachedAt,
  ...over,
});

const statement = (id: string, from: string, through: string, lineDate?: string) =>
  ({
    id,
    coversFrom: from,
    coversThrough: through,
    lines: lineDate
      ? [
          { kind: 'late-ore', date: lineDate },
          { kind: 'correction', date: '2000-01-01' },
        ]
      : [],
  }) as unknown as Statement;

describe('functions mirror of the Corp Tax Book engine', () => {
  it('merges observed rows identically', () => {
    const existing = [
      row(100, '2026-07-12T10:00:00Z'),
      row(5, '2026-07-12T10:00:00Z', { typeId: 9 }),
    ];
    const fresh = [
      row(50, '2026-07-12T11:00:00Z'),
      row(500, '2026-07-12T09:00:00Z', { typeId: 9 }),
      row(300, '2026-07-12T12:00:00Z'),
      row(1, '2026-07-12T12:00:00Z', { characterId: 77 }),
    ];
    expect(mirror.mergeObservedRows(existing, fresh)).toEqual(mergeObservedRows(existing, fresh));
    expect(mirror.observedRowKey(existing[0])).toBe(observedRowKey(existing[0]));
  });

  it('keeps two refineries in one system on one day apart, and a source corporation intact', () => {
    const a = row(10, '2026-07-12T10:00:00Z', {
      structureId: 1,
      solarSystemId: 30000142,
      sourceCorporationId: 5,
    });
    const b = row(10, '2026-07-12T10:00:00Z', { structureId: 2, solarSystemId: 30000142 });
    const merged = mirror.mergeObservedRows([], [a, b]);
    expect(merged).toEqual(mergeObservedRows([], [a, b]));
    expect(merged.rows).toHaveLength(2);
    expect(mirror.observedRowKey(a)).not.toBe(mirror.observedRowKey(b));
    expect(merged.rows.find((r) => r.structureId === 1)?.sourceCorporationId).toBe(5);
  });

  it('agrees on dates and rate rules', () => {
    expect(mirror.isRetroactiveRate('2026-07-11', '2026-07-12')).toBe(
      isRetroactiveRate('2026-07-11', '2026-07-12')
    );
    expect(mirror.isRetroactiveRate('2026-07-12', '2026-07-12')).toBe(
      isRetroactiveRate('2026-07-12', '2026-07-12')
    );
    const statements = [
      statement('a', '2026-07-01', '2026-07-31', '2026-06-20'),
      statement('b', '2026-08-01', '2026-08-10'),
    ];
    for (const day of ['2026-06-20', '2026-06-21', '2026-07-31', '2026-08-05', '2026-08-11']) {
      expect(mirror.canOverrideRecordRate(day, statements)).toBe(
        canOverrideRecordRate(day, daysOnStatements(statements))
      );
    }
    expect([...mirror.statementDays(statements[0])].sort()).toEqual(
      [...statementDays(statements[0])].sort()
    );
  });

  it('agrees on which days a paid Statement closes', () => {
    const statements = [
      statement('a', '2026-07-01', '2026-07-31'),
      statement('b', '2026-08-01', '2026-08-31'),
    ];
    const paid = new Set(['a']);
    for (const day of ['2026-07-31', '2026-08-01']) {
      expect(mirror.canRebillFrom(day, statements, paid)).toBe(
        canRebillFrom(day, statements, paid)
      );
    }
  });

  it('allocates payments to Statements identically, including per-payment credits', () => {
    const statements = [
      { id: 's2', amount: 8_000_000, issuedAt: '2026-07-31T00:00:00Z' },
      { id: 's1', amount: 10_000_000, issuedAt: '2026-06-30T00:00:00Z' },
    ];
    const payments = [
      { id: 'p1', amount: 12_000_000, at: '2026-08-01T00:00:00Z', notTaxAmount: 500_000 },
      { id: 'p2', amount: 3_000_000, at: '2026-08-02T00:00:00Z', statementId: 's2' },
      { id: 'p3', amount: 50_000_000, at: '2026-08-03T00:00:00Z' },
    ];
    const dismissalCredits = [{ statementId: 's1', amount: 1_000_000 }];
    const shared = { statements, payments, dismissalCredits };
    const theirs = mirror.allocatePayments(shared);
    const ours = allocatePayments({
      statements: statements.map((s) => ({ ...s, minerId: 'm', code: '', lines: [] }) as never),
      payments: payments.map((p) => ({
        ...p,
        minerId: 'm',
        characterId: 1,
        source: 'donation' as const,
      })),
      dismissalCredits: dismissalCredits.map((d) => ({ ...d, dismissalId: 'd', chargeKey: 'k' })),
    });
    expect(theirs.paymentCredits).toEqual(ours.paymentCredits);
    expect([...theirs.byStatement]).toEqual([...ours.byStatement]);
    expect(theirs.credit).toBe(ours.credit);
    expect(theirs.balance).toBe(ours.balance);
  });

  it('allocatePayments drops a donation before the start date the same way (#4505)', () => {
    const statements = [{ id: 's1', amount: 10_000_000, issuedAt: '2026-07-01T00:00:00Z' }];
    for (const at of ['2026-05-31T23:59:59Z', '2026-06-01T00:00:00Z']) {
      const payments = [{ id: 'p1', amount: 12_000_000, at }];
      const theirs = mirror.allocatePayments({
        statements,
        payments: payments.map((p) => ({ ...p, source: 'donation' as const })),
        dismissalCredits: [],
        startDate: '2026-06-01',
      });
      const ours = allocatePayments({
        statements: statements.map((s) => ({ ...s, minerId: 'm', code: '', lines: [] }) as never),
        payments: payments.map((p) => ({
          ...p,
          minerId: 'm',
          characterId: 1,
          source: 'donation' as const,
        })),
        dismissalCredits: [],
        startDate: '2026-06-01',
      });
      expect(theirs.paymentCredits).toEqual(ours.paymentCredits);
      expect(theirs.credit).toBe(ours.credit);
      expect(ours.credit).toBe(at.startsWith('2026-06') ? 2_000_000 : 0);
    }
  });

  describe('dismissals (#4184)', () => {
    // Fractured 17 Oct 03:00, expires 19 Oct 03:00; a second moon ran later at the same refinery.
    const extractions: SyncExtraction[] = [
      {
        structureId: 1000,
        moonId: 7,
        extractionStartTime: '2026-10-10T00:00:00Z',
        chunkArrivalTime: '2026-10-17T00:00:00Z',
        naturalDecayTime: '2026-10-17T03:00:00Z',
      },
      {
        structureId: 1000,
        moonId: 8,
        extractionStartTime: '2026-10-19T00:00:00Z',
        chunkArrivalTime: '2026-10-25T00:00:00Z',
        naturalDecayTime: '2026-10-25T03:00:00Z',
        laserFiredAt: '2026-10-25T01:00:00Z',
      },
      {
        structureId: 2000,
        moonId: 9,
        extractionStartTime: '2026-10-01T00:00:00Z',
        chunkArrivalTime: '2026-10-10T00:00:00Z',
        naturalDecayTime: '2026-10-10T03:00:00Z',
        cancelledAt: '2026-10-05T00:00:00Z',
      },
    ];
    const days = [
      '2026-10-16',
      '2026-10-17',
      '2026-10-19',
      '2026-10-20',
      '2026-10-25',
      '2026-10-27',
    ];

    it('puts a refinery on the same moon and Extraction on a day', () => {
      for (const expiry of [{}, { '1000': 96 }] as Record<string, number>[]) {
        const theirs = (structureId: number, date: string) =>
          mirror.moonOnDay(extractions, expiry, structureId, date);
        const ours = placeOfFactory(extractions, expiry);
        for (const structureId of [1000, 2000, 3000]) {
          for (const date of days)
            expect(theirs(structureId, date)).toEqual(ours(structureId, date));
        }
      }
      expect(mirror.extractionIdOf(extractions[0])).toBe(extractionId(extractions[0]));
    });

    it('credits the same Statement lines for record, Miner, moon and Extraction dismissals', () => {
      const dismissal = (
        id: string,
        scope: Dismissal['scope'],
        targetId: string,
        reversed = false
      ): Dismissal => ({
        id,
        scope,
        targetId,
        by: 1,
        at: '2026-10-21T10:00:00Z',
        reason: 'r',
        ...(reversed ? { reversed: { by: 1, at: '2026-10-22T00:00:00Z' } } : {}),
      });
      const statements = [
        {
          id: 's1',
          lines: days.map((date, i) => ({
            chargeKey: `50:1000:${date}`,
            date,
            tax: 100 * (i + 1),
            structureId: 1000,
          })),
        },
        {
          id: 's2',
          lines: [{ chargeKey: 'a:2000', date: '2026-10-17', tax: 7, structureId: 2000 }],
        },
      ];
      const sets: Dismissal[][] = [
        [],
        [dismissal('d', 'moon', '7')],
        [dismissal('d', 'moon', '8')],
        [dismissal('d', 'extraction', extractionId(extractions[0]))],
        [dismissal('d', 'extraction', extractionId(extractions[1]))],
        [dismissal('d', 'record', '50:1000:2026-10-17')],
        [dismissal('d', 'miner', 'solo:50')],
        [dismissal('d', 'moon', '7', true)],
        [dismissal('a', 'moon', '7'), dismissal('b', 'extraction', extractionId(extractions[0]))],
      ];
      const place = placeOfFactory(extractions, {});
      for (const dismissals of sets) {
        const charges = statements.flatMap((s) =>
          s.lines.map((l) => ({
            key: l.chargeKey,
            minerId: 'solo:50',
            date: l.date,
            ...place(l.structureId, l.date),
          }))
        );
        const ours = dismissalCredits(
          statements.map(
            (s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, kind: 'mined' })) }) as never
          ),
          dismissals,
          charges
        ).map((c) => ({ statementId: c.statementId, amount: c.amount }));
        const theirs = mirror.dismissalCredits({
          minerId: 'solo:50',
          statements,
          dismissals,
          extractions,
          expiryHours: {},
        });
        expect(theirs).toEqual(ours);
      }
    });
  });

  it('agrees on when credit may be forfeited', () => {
    expect(mirror.FORFEIT_NO_REPLY_DAYS).toBe(FORFEIT_NO_REPLY_DAYS);
    const bases = [
      { kind: 'consent' as const, note: 'agreed' },
      { kind: 'consent' as const, note: '  ' },
      { kind: 'no-reply' as const, askedAt: '2026-07-20' },
      { kind: 'no-reply' as const, askedAt: '2026-07-21' },
    ];
    for (const basis of bases) {
      expect(mirror.forfeitAllowed(basis, '2026-10-18')).toBe(forfeitAllowed(basis, '2026-10-18'));
    }
  });

  it('keeps the book defaults equal to the engine constants', () => {
    expect(mirror.BOOK_DEFAULTS.graceHours).toBe(DEFAULT_GRACE_HOURS);
    expect(mirror.BOOK_DEFAULTS.minimumStatement).toBe(DEFAULT_MINIMUM_STATEMENT);
    expect(mirror.BOOK_DEFAULTS.overdueDays).toBe(DEFAULT_OVERDUE_DAYS);
  });
});

describe('feeder coverage mirror', () => {
  const periods = [{ from: '2026-06-01', to: '2026-06-30' }, { from: '2026-07-10' }];

  it('answers isDayCovered the same', () => {
    for (const day of [
      '2026-05-31',
      '2026-06-01',
      '2026-06-30',
      '2026-07-01',
      '2026-07-10',
      '2027-01-01',
    ]) {
      expect(mirror.isDayCovered(periods, day)).toBe(isDayCovered(periods, day));
    }
  });

  it('closes periods the same', () => {
    for (const day of ['2026-07-10', '2026-07-11', '2026-07-01']) {
      expect(mirror.closePeriod(periods, day)).toEqual(closePeriod(periods, day));
    }
  });

  it('reopens periods the same, and refuses the same', () => {
    const closed = closePeriod(periods, '2026-07-20');
    expect(mirror.reopenPeriod(closed, '2026-07-20')).toEqual(reopenPeriod(closed, '2026-07-20'));
    expect(() => mirror.reopenPeriod(periods, '2026-08-01')).toThrow();
    expect(() => mirror.reopenPeriod(closed, '2026-07-19')).toThrow();
  });
});

describe('feeder health mirror', () => {
  it('keeps the disconnect window equal', () => {
    expect(mirror.FEEDER_DISCONNECT_DAYS).toBe(FEEDER_DISCONNECT_DAYS);
  });

  it('advances health the same', () => {
    const prevs: FeederHealth[] = [
      { status: 'active' },
      { status: 'active', lastReadWellAt: '2026-10-01T00:00:00.000Z' },
      { status: 'active', staleSince: '2026-09-20T12:00:00.000Z' },
      { status: 'active', staleSince: '2026-09-21T12:00:01.000Z' },
      { status: 'disconnected', staleSince: '2026-08-01T00:00:00.000Z' },
    ];
    for (const prev of prevs)
      for (const outcome of ['ok', 'stale', 'none'] as const)
        expect(mirror.advanceFeederHealth(prev, outcome, '2026-10-20T12:00:00.000Z')).toEqual(
          advanceFeederHealth(prev, outcome, '2026-10-20T12:00:00.000Z')
        );
  });

  it('ends disconnected coverage the same', () => {
    const periods = [{ from: '2026-01-01', to: '2026-02-01' }, { from: '2026-08-01' }];
    for (const lastReadWellAt of [
      undefined,
      '2026-09-10T08:00:00.000Z',
      '2026-09-10T05:00:00.000Z',
    ])
      for (const grace of [undefined, 6, 12])
        expect(mirror.disconnectedCoverage(periods, { lastReadWellAt }, grace)).toEqual(
          disconnectedCoverage(periods, { lastReadWellAt }, grace)
        );
  });
});

describe('feeder accrual mirror', () => {
  const rules = {
    coveragePeriods: [{ from: '2026-06-03', to: '2026-06-20' }],
    ownerRateHistory: [
      { kind: 'requested' as const, pct: 8, effectiveFrom: '2026-06-01', recordedAt: 'a' },
      { kind: 'agreed' as const, pct: 12.5, effectiveFrom: '2026-06-06', recordedAt: 'b' },
    ],
    modeChanges: [
      { from: '2026-06-10', mode: 'settled-otherwise' as const },
      { from: '2026-06-12', mode: 'normal' as const },
    ],
    isBillable: (day: string) => day !== '2026-06-15',
  };
  const days = ['02', '04', '07', '10', '11', '12', '15', '19', '21'].map((d, i) => ({
    date: `2026-06-${d}`,
    value: 1000.37 * (i + 1),
  }));

  it('accrues the same', () => {
    expect(mirror.accrueValuedDays(days, rules)).toEqual(accrueValuedDays(days, rules));
  });

  it('balances and lists the same', () => {
    const payouts = [
      { amount: 700, notAPayout: false },
      { amount: 5000, notAPayout: true },
    ];
    for (const accrued of [0, 0.4, 699.9, 1500.75]) {
      const b = feederBalance(accrued, payouts);
      expect(mirror.feederBalance(accrued, payouts)).toEqual(b);
      expect(mirror.onPayList(b)).toBe(onPayList(b));
      expect(mirror.feederBalance(accrued, payouts, true)).toEqual(
        feederBalance(accrued, payouts, true)
      );
    }
  });

  it('resolves same-day ties and agreed-over-requested the same', () => {
    const history = [
      { kind: 'agreed' as const, pct: 5, effectiveFrom: '2026-06-04', recordedAt: '1' },
      { kind: 'agreed' as const, pct: 7, effectiveFrom: '2026-06-04', recordedAt: '2' },
      { kind: 'requested' as const, pct: 30, effectiveFrom: '2026-06-02', recordedAt: '1' },
      { kind: 'requested' as const, pct: 40, effectiveFrom: '2026-06-02', recordedAt: '1' },
    ];
    const r = { ...rules, modeChanges: [], isBillable: () => true, ownerRateHistory: history };
    expect(mirror.accrueValuedDays(days, r)).toEqual(accrueValuedDays(days, r));
  });
});

describe('feeder view mirror', () => {
  it('closes days the same', () => {
    for (const day of ['2026-06-30', '2026-12-31', '2028-02-28']) {
      for (const grace of [0, 6, 30]) {
        expect(mirror.dayClosesAt(day, grace)).toBe(dayClosesAt(day, grace));
      }
    }
    expect(mirror.dayClosesAt('2026-06-01')).toBe(dayClosesAt('2026-06-01'));
  });

  it('maps Ore Form the same', () => {
    const map = { '18': 62528, '19': 62572 };
    for (const raw of [18, 19, 20]) {
      for (const compressed of [true, false]) {
        expect(mirror.oreFormTypeId(raw, map, compressed)).toBe(
          oreFormTypeId(raw, map, compressed)
        );
      }
    }
  });
});

describe('removal mirror (#4520)', () => {
  const H = 3_600_000;
  it('payeeMayForce agrees on the boundaries', () => {
    const start = 1000 * H;
    for (const changed of [undefined, start - 49 * H, start - 47 * H, start, start + H]) {
      const input = { payeeChangedAt: changed, removalStartedAt: start };
      expect(mirror.payeeMayForce(input)).toBe(removal.payeeMayForce(input));
    }
  });
  it('the clock, due check and recipients agree', () => {
    expect(mirror.REMOVAL_WAIT_MS).toBe(removal.REMOVAL_WAIT_MS);
    const by = { characterId: 1, name: 'A' };
    const pending = removal.startRemoval({ status: 'active' }, by, 5);
    expect(mirror.startRemoval({ status: 'active' }, by, 5)).toEqual(pending);
    const sent = removal.recordRemovalNotice(pending, 9);
    expect(mirror.recordRemovalNotice(pending, 9)).toEqual(sent);
    for (const now of [9, 9 + 24 * H, 9 + 25 * H]) {
      expect(mirror.isRemovalDue(sent, now)).toBe(removal.isRemovalDue(sent, now));
    }
    const rec = { officerIds: [1, 2, 3], startedBy: 1, ceoId: 3, payeeId: 4 };
    expect(mirror.removalRecipients(rec)).toEqual(removal.removalRecipients(rec));
  });
});
