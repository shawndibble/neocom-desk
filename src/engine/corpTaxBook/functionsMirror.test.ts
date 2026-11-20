import { HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import * as mirror from '../../../functions/src/corpTaxBookEngine';
import * as calls from '../../../functions/src/corpTaxBookKinds';
import { liveAccount } from '../../../functions/src/corpTaxBookAccounts';
import { netOf } from './paymentPreview';
import { allocatePayments, dismissalCredits, isBeforeBook } from './allocation';
import {
  DISPUTE_HOLD_DAYS,
  DISPUTE_KINDS,
  disputeHold,
  heldByStatement,
  readDisputes,
} from './disputes';
import { CLAIM_CHECK_RESULTS, TRANSFER_RECIPIENTS } from './overdue';
import { TAX_CONTACT_MAX_CHARACTERS } from './bookDocs';
import { DEFAULT_NOTICE_RULES, NOTICE_AFTER_KINDS } from './notices';
import { DAY_SETTLE_TOLERANCE_PCT } from './runningAccount';
import { placeOfFactory } from './openSet';
import { FORFEIT_NO_REPLY_DAYS, forfeitAllowed } from './closeAccount';
import type { Dismissal } from './dismissals';
import { extractionId, type SyncExtraction } from './sync';
import {
  clampCoverageFrom,
  closePeriod,
  isDayCovered,
  reconnectCoverageFrom,
  reopenPeriod,
} from './coverage';
import { oreFormTypeId } from '../miningTax/oreForm';
import { moonOwnerUnitPrice } from './valuation';
import {
  FEEDER_DISCONNECT_DAYS,
  advanceFeederHealth,
  disconnectedCoverage,
  type FeederHealth,
} from './feederHealth';
import {
  accrueValuedDays,
  deriveModeChanges,
  deriveOwnerRateHistory,
  feederBalance,
  feederBillableRule,
  onPayList,
} from './feederAccrual';
import { FEEDER_VIEW_RULES } from './moonOwners';
import {
  balanceAfter,
  buildRecordedPayout,
  carriesPayoutReference,
  outgoingDonationsFromJournal,
  PAYOUT_LINK_WINDOW_DAYS,
  PAYOUT_REASON_PREFIX,
  payeeIdsAt,
  payoutId,
  payoutPeriod,
  payoutReason,
  payoutToMerge,
  reconcileBookOutgoing,
  withPayeeChange,
  type OutgoingDonation,
} from './payouts';
import { DEFAULT_GRACE_HOURS, dayClosesAt } from './billable';
import { DEFAULT_OVERDUE_DAYS } from './overdue';
import { DIVISION_NAME_MAX } from './divisionNames';
import { mergeObservedRows, observedRowKey } from './observed';
import { latestRecordedCorp } from './bookDocs';
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
import { effectiveOwnerRate } from './ownerRate';
import { moonOwnerMailRecipients } from './ownerRateMail';

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

  it('keeps the dispute, transfer and tax contact vocabularies equal', () => {
    expect([...calls.DISPUTE_KINDS]).toEqual([...DISPUTE_KINDS]);
    expect([...calls.TRANSFER_RECIPIENTS]).toEqual([...TRANSFER_RECIPIENTS]);
    expect([...calls.CLAIM_CHECK_RESULTS]).toEqual([...CLAIM_CHECK_RESULTS]);
    expect(calls.TAX_CONTACT_MAX_CHARACTERS).toBe(TAX_CONTACT_MAX_CHARACTERS);
  });

  it('takes payments off the pay page’s total net of not tax, as the client counts them', () => {
    const payments = [
      { amount: 5 },
      { amount: 7, notTaxAmount: 3 },
      { amount: 2, notTaxAmount: 9 },
    ];
    const counted = payments.reduce((sum, p) => sum + netOf(p), 0);
    expect(liveAccount({ owed: 100, paid: 0, days: 1, at: 'x' }, payments).owed).toBe(
      100 - counted
    );
    expect(liveAccount({ owed: 100, paid: counted, days: 1, at: 'x' }, payments).owed).toBe(100);
  });

  it('keeps the running account’s notice rules and day tolerance equal', () => {
    expect([...calls.NOTICE_AFTER_KINDS]).toEqual([...NOTICE_AFTER_KINDS]);
    expect(calls.NOTICE_DEFAULTS).toEqual(DEFAULT_NOTICE_RULES);
    expect(calls.DAY_TOLERANCE_PCT_DEFAULT).toBe(DAY_SETTLE_TOLERANCE_PCT);
  });

  it('reads stored disputes and their hold the way the client does, malformed ones included', () => {
    const line = { recordKey: '60:1000:2026-11-01', typeId: 45490, quantity: 10, payeeName: 'X' };
    const base = {
      id: 'd',
      minerId: 'm',
      date: '2026-11-01',
      by: 60,
      at: '2026-11-03T00:00:00.000Z',
    };
    const stored: unknown[] = [
      { ...base, lines: [line] },
      { ...base, lines: [line], holdFrom: '2026-10-01T00:00:00.000Z' },
      { ...base, lines: [line], holdFrom: 'junk' },
      { ...base, lines: [line], resolution: { kind: 'rejected', at: 'a', by: 1, reason: 'r' } },
      { ...base, lines: [line], resolution: { kind: 'rejected' } },
      { ...base, lines: [line], resolution: 'rejected' },
      { ...base, lines: [line], resolution: { kind: 'dismissed', at: 'a', by: 1, reason: 'r' } },
      { ...base, lines: [] },
      { ...base },
      // A withdrawn day's tombstone: no lines, so no reader sees a dispute, but it keeps its hold.
      {
        id: 'd',
        minerId: 'm',
        date: '2026-11-01',
        holdFrom: '2026-10-01T00:00:00.000Z',
        history: [],
        withdrawnAt: '2026-11-04T00:00:00.000Z',
      },
      { ...base, lines: [line, { recordKey: 5 }] },
      { ...base, lines: 'lines' },
      { ...base, lines: [line], kind: 'rate', claimedPct: 10 },
      { ...base, lines: [line], kind: 'bogus' },
      { ...base, at: 5, lines: [line] },
      null,
      'x',
    ];
    const theirs = mirror.readHoldingDisputes(stored);
    const ours = readDisputes(stored);
    expect(theirs).toHaveLength(ours.length);
    for (const now of ['2026-11-05T00:00:00.000Z', '2026-11-20T00:00:00.000Z']) {
      expect(theirs.map((d) => mirror.disputeHolds(d, now))).toEqual(
        ours.map((d) => disputeHold(d, now) !== undefined)
      );
    }
    // The first dispute's hold window survives a re-dispute: no renewal.
    expect(mirror.disputeHolds(theirs[1], '2026-10-20T00:00:00.000Z')).toBe(false);
    expect(disputeHold(ours[1], '2026-10-20T00:00:00.000Z')).toBeUndefined();
  });

  it('holds disputed amounts identically, and allocates around them the same way', () => {
    expect(mirror.DISPUTE_HOLD_DAYS).toBe(DISPUTE_HOLD_DAYS);
    const statements = [
      {
        id: 's1',
        lines: [
          {
            kind: 'mined',
            chargeKey: '60:1000:2026-11-01',
            oreLines: [{ typeId: 45490, quantity: 400 }],
            unitPrices: { '45490': 1000 },
            taxPct: 12,
            tax: 48_000,
          },
          {
            kind: 'mined',
            chargeKey: '60:1000:2026-11-02',
            oreLines: [{ typeId: 45490, quantity: 100 }],
            unitPrices: { '45490': 1000 },
            taxPct: 12,
            tax: 12_000,
          },
        ],
      },
    ];
    const disputes = [
      {
        at: '2026-11-03T00:00:00.000Z',
        kind: 'rate',
        claimedPct: 10,
        lines: [{ recordKey: '60:1000:2026-11-01', typeId: 45490, quantity: 400 }],
      },
      {
        at: '2026-11-03T00:00:00.000Z',
        lines: [{ recordKey: '60:1000:2026-11-02', typeId: 45490, quantity: 100 }],
      },
    ];
    for (const now of ['2026-11-05T00:00:00.000Z', '2026-12-01T00:00:00.000Z']) {
      for (const credited of [new Set<string>(), new Set(['s1|60:1000:2026-11-02'])]) {
        const theirs = mirror.heldByStatement(statements, disputes, credited, now);
        const ours = heldByStatement(
          statements,
          disputes.map((d) => ({
            ...d,
            lines: d.lines.map((l) => ({ ...l, payeeName: '' })),
          })) as never,
          credited,
          now
        );
        expect([...theirs]).toEqual([...ours]);
      }
    }
    const held = new Map([['s1', 20_000]]);
    const theirs = mirror.allocatePayments({
      statements: [{ id: 's1', amount: 60_000, issuedAt: '2026-11-30T00:00:00Z' }],
      payments: [{ id: 'p1', amount: 40_000, at: '2026-12-01T00:00:00Z' }],
      dismissalCredits: [],
      held,
    });
    const ours = allocatePayments({
      statements: [
        {
          id: 's1',
          amount: 60_000,
          issuedAt: '2026-11-30T00:00:00Z',
          minerId: 'm',
          code: '',
          lines: [],
        } as never,
      ],
      payments: [
        {
          id: 'p1',
          amount: 40_000,
          at: '2026-12-01T00:00:00Z',
          minerId: 'm',
          characterId: 1,
          source: 'donation',
        },
      ],
      dismissalCredits: [],
      held,
    });
    expect([...theirs.byStatement]).toEqual([...ours.byStatement]);
    expect(ours.byStatement.get('s1')).toMatchObject({ settled: true, held: 20_000 });
  });

  it('applies officer write-offs identically (#4637)', () => {
    const statements = [
      { id: 's2', amount: 8_000_000, issuedAt: '2026-07-31T00:00:00Z' },
      { id: 's1', amount: 10_000_000, issuedAt: '2026-06-30T00:00:00Z' },
      { id: 's3', amount: 4_000_000, issuedAt: '2026-08-31T00:00:00Z' },
    ];
    const payments = [{ id: 'p1', amount: 9_000_000, at: '2026-09-01T00:00:00Z' }];
    const officerWriteOffs = [
      { id: 'w2', amount: 20_000_000, at: '2026-09-03T00:00:00Z' },
      { id: 'w1', amount: 5_000_000, at: '2026-09-02T00:00:00Z', statementId: 's3' },
    ];
    const theirs = mirror.allocatePayments({
      statements,
      payments,
      dismissalCredits: [],
      officerWriteOffs,
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
      officerWriteOffs,
    });
    expect(theirs.writeOffCredits).toEqual(ours.writeOffCredits);
    expect([...theirs.byStatement]).toEqual([...ours.byStatement]);
    expect(theirs.credit).toBe(ours.credit);
    expect(theirs.balance).toBe(ours.balance);
    expect(ours.balance).toBe(0);
    expect(
      mirror.writeOffForAllocation({ id: 'w1', amount: 5, at: 'x', statementId: 's1', uids: [] })
    ).toEqual({ id: 'w1', amount: 5, at: 'x', statementId: 's1' });
    expect(mirror.writeOffForAllocation({ id: 'w1', amount: 5 })).toBeNull();
    // A malformed stamp is not a reversal on either side.
    expect(mirror.writeOffForAllocation({ id: 'w1', amount: 5, at: 'x', reversed: {} })).toEqual({
      id: 'w1',
      amount: 5,
      at: 'x',
    });
    // An officer's reversal takes the write-off out of every allocation.
    expect(
      mirror.writeOffForAllocation({
        id: 'w1',
        amount: 5,
        at: 'x',
        reversed: { by: 1, at: 'y', reason: 'z' },
      })
    ).toBeNull();
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
        ).map((c) => ({ statementId: c.statementId, amount: c.amount, chargeKey: c.chargeKey }));
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
    expect(mirror.DIVISION_NAME_MAX).toBe(DIVISION_NAME_MAX);
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

  it('clamps a coverage start the same', () => {
    const closed = [{ from: '2026-10-01', to: '2026-10-10' }];
    for (const set of [[], closed]) {
      for (const day of [undefined, '2026-10-25', '2026-10-05', '2026-10-15', '2026-09-01']) {
        expect(mirror.clampCoverageFrom(set, day, '2026-10-20')).toBe(
          clampCoverageFrom(set, day, '2026-10-20')
        );
      }
    }
  });

  it('starts a reconnect the same', () => {
    for (const set of [
      [],
      [{ from: '2026-08-01', to: '2026-09-01' }],
      [{ from: '2026-10-01', to: '2026-10-10' }],
    ]) {
      for (const joined of [undefined, '2026-09-10', '2026-10-15']) {
        expect(mirror.reconnectCoverageFrom(set, '2026-10-20', joined)).toBe(
          reconnectCoverageFrom(set, '2026-10-20', joined)
        );
      }
    }
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
    const asked = { ...r, ownerRateHistory: history.filter((h) => h.kind === 'requested') };
    expect(mirror.accrueValuedDays(days, asked)).toEqual(accrueValuedDays(days, asked));
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
    expect(mirror.dayClosesAt('2026-06-01')).toBe('2026-06-02T00:30:00.000Z');
    for (const g of [0.5, 1.5])
      expect(mirror.dayClosesAt('2026-06-01', g)).toBe(dayClosesAt('2026-06-01', g));
  });

  it('closes a day for a read stamped at the 00:35 tick (day closes 00:30), not before', () => {
    const closes = Date.parse('2026-06-02T00:30:00Z');
    const rule = (at: number) => mirror.feederBillableRule(at, mirror.BOOK_DEFAULTS.graceHours);
    expect(rule(closes + 40_000)('2026-06-01')).toBe(true);
    expect(rule(closes)('2026-06-01')).toBe(true);
    expect(rule(closes - 1)('2026-06-01')).toBe(false);
  });

  it('applies the moon owner Billable rule the same', () => {
    const closes = Date.parse(dayClosesAt('2026-06-30', 6));
    for (const lastRead of [undefined, closes - 1, closes, closes + 1, Date.parse('2027-01-01')]) {
      for (const grace of [0, 6, 30]) {
        for (const day of ['2026-06-29', '2026-06-30', '2026-07-01', '2026-12-31']) {
          expect(mirror.feederBillableRule(lastRead, grace)(day)).toBe(
            feederBillableRule(lastRead, grace)(day)
          );
        }
      }
    }
  });

  it("derives a record's rate history and mode switches the same", () => {
    const history = [
      { kind: 'agreed' as const, pct: 5, effectiveFrom: '2026-06-02', recordedAt: 'x' },
    ];
    const modeChanges = [{ from: '2026-06-03', mode: 'normal' as const }];
    const joinedAt = Date.parse('2026-06-01T23:59:59.999Z');
    for (const record of [
      { joinedAt, mode: 'normal' as const },
      { joinedAt, mode: 'settled-otherwise' as const },
      { joinedAt, mode: 'settled-otherwise' as const, modeChanges },
      { joinedAt, requestedRatePct: 6 },
      { joinedAt, requestedRatePct: 6, agreedRatePct: 8 },
      { joinedAt, agreedRatePct: 8, ownerRateHistory: history },
    ]) {
      expect(mirror.deriveOwnerRateHistory(record)).toEqual(deriveOwnerRateHistory(record));
      expect(mirror.deriveModeChanges(record)).toEqual(deriveModeChanges(record));
    }
  });

  it("prices a moon owner's ore the same (#4621)", () => {
    for (const side of [
      undefined,
      { buy: 120, sell: 150 },
      { buy: null, sell: 150 },
      { buy: 0, sell: 0 },
      { buy: null, sell: null },
    ]) {
      expect(mirror.moonOwnerUnitPrice(side)).toBe(moonOwnerUnitPrice(side));
      for (const billed of [undefined, 0, 80])
        expect(mirror.moonOwnerUnitPrice(side, billed)).toBe(moonOwnerUnitPrice(side, billed));
    }
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

  it('reads, records and matches moon owner payouts identically', () => {
    const journal = [
      {
        id: 1,
        date: '2026-10-18T10:00:00Z',
        ref_type: 'player_donation',
        amount: -5e6,
        first_party_id: 9,
        second_party_id: 77,
      },
      {
        id: 2,
        date: '2026-10-19T10:00:00Z',
        ref_type: 'player_donation',
        amount: -6e6,
        first_party_id: 9,
        second_party_id: 77,
      },
      {
        id: 3,
        date: '2026-10-19T10:00:00Z',
        ref_type: 'player_donation',
        amount: 6e6,
        first_party_id: 77,
      },
      // A corporation wallet "Give ISK" (#4504 B1); a move between its own divisions is not.
      {
        id: 4,
        date: '2026-10-19T11:00:00Z',
        ref_type: 'corporation_account_withdrawal',
        amount: -7e6,
        first_party_id: 9,
        second_party_id: 77,
      },
      {
        id: 5,
        date: '2026-10-19T11:00:00Z',
        ref_type: 'corporation_account_withdrawal',
        amount: -7e6,
        first_party_id: 9,
        second_party_id: 9,
      },
    ];
    const outgoing: OutgoingDonation[] = outgoingDonationsFromJournal(journal, 1, 9);
    expect(outgoing.map((o) => o.refId)).toEqual([1, 2, 4]);
    expect(mirror.outgoingDonationsFromJournal(journal, 1, 9)).toEqual(outgoing);
    const payouts = [
      {
        id: 'a',
        date: '2026-10-17',
        amount: 5e6,
        method: 'donation' as const,
        status: 'waiting-for-journal' as const,
        notAPayout: false,
      },
    ];
    const history = [
      { payee: { kind: 'character' as const, id: 70 }, from: 0 },
      { payee: { kind: 'character' as const, id: 77 }, from: Date.parse('2026-10-19T00:00:00Z') },
    ];
    const input = {
      owners: [
        {
          corporationId: 5,
          payee: { kind: 'character' as const, id: 77 },
          payouts,
          since: '2026-10-01',
        },
        { corporationId: 6, payeeHistory: history, payouts: [], since: '2026-10-01' },
      ],
      outgoing,
    };
    expect(mirror.reconcileBookOutgoing(input)).toEqual(reconcileBookOutgoing(input));
    // With the payout reference on some donations and not others (#6209).
    const referenced = {
      ...input,
      outgoing: outgoing.map((o, i) => (i === 1 ? { ...o, reason: 'Moon mining payout' } : o)),
    };
    expect(mirror.reconcileBookOutgoing(referenced)).toEqual(reconcileBookOutgoing(referenced));
    const waiting = [
      {
        ...payouts[0]!,
        id: 'j1_9',
        status: 'matched' as const,
        journalRef: 9,
        notAPayout: true,
        unconfirmed: true,
      },
    ];
    const sent = { amount: 5e6, date: '2026-10-17', method: 'donation' as const };
    expect(mirror.payoutToMerge(waiting, sent)).toBe(payoutToMerge(waiting, sent));
    for (const at of ['2026-10-18T10:00:00Z', '2026-10-19T10:00:00Z']) {
      expect(mirror.payeeIdsAt(input.owners[1]!, at)).toEqual(payeeIdsAt(input.owners[1]!, at));
    }
    const legacy = { payee: { kind: 'character' as const, id: 70 }, payeeChangedAt: 3 };
    expect(mirror.withPayeeChange(legacy, { kind: 'character', id: 77 }, 9)).toEqual(
      withPayeeChange(legacy, { kind: 'character', id: 77 }, 9)
    );
    const auto = [{ ...payouts[0]!, id: 'j1_1', status: 'matched' as const, journalRef: 1 }];
    const recorded = { amount: 5e6, date: '2026-10-19', method: 'donation' as const };
    expect(mirror.payoutToMerge(auto, recorded)).toBe(payoutToMerge(auto, recorded));
    for (const method of ['donation', 'contract', 'other'] as const) {
      const rec = { amount: 12, date: '2026-10-18', method };
      expect(mirror.buildRecordedPayout(rec)).toEqual(buildRecordedPayout(rec));
    }
  });
});

describe('removal mirror (#4520)', () => {
  it('payeeMayForce agrees on the boundaries', () => {
    const start = 1000 * HOUR_MS;
    for (const changed of [
      undefined,
      start - 49 * HOUR_MS,
      start - 47 * HOUR_MS,
      start,
      start + HOUR_MS,
    ]) {
      for (const payeeSetBy of [undefined, 'accounting', 'moon-owner'] as const) {
        const input = { payeeChangedAt: changed, removalStartedAt: start, payeeSetBy };
        expect(mirror.payeeMayForce(input)).toBe(removal.payeeMayForce(input));
      }
    }
  });
  it('the clock, due check and recipients agree', () => {
    expect(mirror.REMOVAL_WAIT_MS).toBe(removal.REMOVAL_WAIT_MS);
    const by = { characterId: 1, name: 'A' };
    const pending = removal.startRemoval({ status: 'active' }, by, 5);
    expect(mirror.startRemoval({ status: 'active' }, by, 5)).toEqual(pending);
    const sent = removal.recordRemovalNotice(pending, 9);
    expect(mirror.recordRemovalNotice(pending, 9)).toEqual(sent);
    for (const now of [9, 9 + 24 * HOUR_MS, 9 + 25 * HOUR_MS]) {
      expect(mirror.isRemovalDue(sent, now)).toBe(removal.isRemovalDue(sent, now));
    }
    const rec = {
      officerIds: [1, 2, 3],
      startedBy: 1,
      ceoId: 3,
      payee: { kind: 'corporation' as const, id: 9 },
      payeeCeoId: 4,
    };
    expect(mirror.removalRecipients(rec)).toEqual(removal.removalRecipients(rec));
  });
});

describe('remaining engine parity (#4515, #4520, #4621)', () => {
  it('effectiveOwnerRatePct agrees: agreed wins, ties, nothing yet', () => {
    const history = [
      { kind: 'requested' as const, pct: 8, effectiveFrom: '2026-06-01', recordedAt: 'a' },
      { kind: 'agreed' as const, pct: 5, effectiveFrom: '2026-06-04', recordedAt: '1' },
      { kind: 'agreed' as const, pct: 7, effectiveFrom: '2026-06-04', recordedAt: '2' },
    ];
    for (const date of ['2026-05-31', '2026-06-01', '2026-06-04', '2026-07-01']) {
      expect(mirror.effectiveOwnerRatePct(history, date)).toBe(
        effectiveOwnerRate(history, date)?.pct
      );
    }
    expect(mirror.effectiveOwnerRatePct([], '2026-06-01')).toBeUndefined();
    const asOf = [{ ...history[1]!, noBackdate: true as const }];
    for (const date of ['2026-06-03', '2026-06-04']) {
      expect(mirror.effectiveOwnerRatePct(asOf, date)).toBe(effectiveOwnerRate(asOf, date)?.pct);
    }
    expect(mirror.effectiveOwnerRatePct(asOf, '2026-06-03')).toBeUndefined();
    const askedOnly = [history[0]!];
    expect(mirror.effectiveOwnerRatePct(askedOnly, '2026-06-02')).toBeUndefined();
    expect(effectiveOwnerRate(askedOnly, '2026-06-02')).toBeUndefined();
  });

  it('removal state guards agree', () => {
    const states = ['active', 'pending-removal', 'removed', 'left', 'disconnected'] as const;
    const by = { characterId: 1, name: 'A' };
    for (const status of states) {
      expect(mirror.canStartRemoval({ status })).toBe(removal.canStartRemoval({ status }));
    }
    const pending = removal.startRemoval({ status: 'active' }, by, 5);
    expect(mirror.cancelRemoval(pending)).toEqual(removal.cancelRemoval(pending));
    expect(() => mirror.cancelRemoval({ status: 'active' })).toThrow();
    expect(() => removal.cancelRemoval({ status: 'active' })).toThrow();
  });

  it('payee helpers agree', () => {
    const payees = [
      undefined,
      { kind: 'character' as const, id: 7 },
      { kind: 'corporation' as const, id: 9 },
    ];
    for (const payee of payees) {
      for (const characterId of [7, 8]) {
        for (const payeeCorporationCeoId of [undefined, 7, 8]) {
          const input = { payee, characterId, payeeCorporationCeoId };
          expect(mirror.isPayeeActor(input)).toBe(removal.isPayeeActor(input));
        }
      }
    }
    const recs = [
      { payee: { kind: 'character' as const, id: 7 } },
      { payee: { kind: 'character' as const, id: 7 }, payeeChangedAt: 3 },
      {},
    ];
    for (const rec of recs) {
      for (const p of [
        { kind: 'character' as const, id: 7 },
        { kind: 'corporation' as const, id: 7 },
      ]) {
        expect(mirror.withPayee(rec, p, 99)).toEqual(removal.withPayee(rec, p, 99));
      }
    }
  });

  it('moonOwnerMailRecipients agrees', () => {
    const inputs = [
      { ceoId: 1, payee: { kind: 'character' as const, id: 1 } },
      { ceoId: 1, payee: { kind: 'character' as const, id: 2 } },
      { ceoId: 1, payee: { kind: 'corporation' as const, id: 9 }, payeeCeoId: 3 },
      { ceoId: 1, payee: { kind: 'corporation' as const, id: 9 }, payeeCeoId: null },
      { ceoId: null },
    ];
    for (const input of inputs) {
      expect(mirror.moonOwnerMailRecipients(input)).toEqual(moonOwnerMailRecipients(input));
    }
  });

  it('payout helpers agree', () => {
    expect(mirror.PAYOUT_LINK_WINDOW_DAYS).toBe(PAYOUT_LINK_WINDOW_DAYS);
    expect(mirror.PAYOUT_REASON_PREFIX).toBe(PAYOUT_REASON_PREFIX);
    expect(mirror.FEEDER_VIEW_RULES).toBe(FEEDER_VIEW_RULES);
    for (const reason of [undefined, 'SRP refund', 'MOON MINING PAYOUT, 2026-10-01', ''])
      expect(mirror.carriesPayoutReference(reason)).toBe(carriesPayoutReference(reason));
    expect(mirror.payoutId({ division: 2, refId: 55 })).toBe(payoutId({ division: 2, refId: 55 }));
    const period = { from: '2026-10-01', to: '2026-10-09' };
    for (const p of [period, undefined]) {
      expect(mirror.payoutReason('Moon mining payout', p)).toBe(
        payoutReason('Moon mining payout', p)
      );
    }
    const days = ['2026-10-03', '2026-10-01', '2026-10-09'].map((date) => ({ date }));
    const paid = [
      { date: '2026-10-02', notAPayout: false },
      { date: '2026-10-08', notAPayout: true },
    ];
    for (const [d, p] of [
      [days, paid],
      [days, []],
      [days, [{ date: '2026-10-09', notAPayout: false }]],
      [[], paid],
    ] as const) {
      expect(mirror.payoutPeriod(d, p)).toEqual(payoutPeriod(d, p));
    }
    for (const [balance, sent] of [
      [100.5, 100],
      [100, 100],
      [50, 100.9],
      [0, 0],
    ] as const) {
      expect(mirror.balanceAfter(balance, sent)).toEqual(balanceAfter(balance, sent));
    }
  });

  it('isBeforeBook agrees', () => {
    for (const at of ['2026-09-30T23:59:59Z', '2026-10-01T00:00:00Z', '2026-10-02']) {
      expect(mirror.isBeforeBook(at, '2026-10-01')).toBe(isBeforeBook(at, '2026-10-01'));
    }
  });
});

describe('latest recorded corp mirror', () => {
  const row = (over: Partial<Parameters<typeof latestRecordedCorp>[0][number]> = {}) => ({
    characterId: 9,
    date: '2026-10-17',
    recordedCorporationId: 98000001,
    structureId: 1020,
    cachedAt: '2026-10-17T10:00:00Z',
    ...over,
  });
  it.each([
    ['newest day', [row({ date: '2026-10-16', recordedCorporationId: 2 }), row()]],
    [
      'mid-day corp change, fresher read',
      [
        row({ structureId: 2000 }),
        row({ recordedCorporationId: 2, cachedAt: '2026-10-17T15:00:00Z' }),
      ],
    ],
    ['one read, two refineries', [row({ structureId: 2000 }), row({ recordedCorporationId: 2 })]],
    ['one read, one refinery', [row({ recordedCorporationId: 2 }), row()]],
    ['a row with no read time', [row({ cachedAt: undefined, recordedCorporationId: 2 }), row()]],
    ['several characters', [row(), row({ characterId: 10, recordedCorporationId: 2 })]],
  ])('%s', (_, rows) => {
    for (const order of [rows, [...rows].reverse()]) {
      expect(mirror.latestRecordedCorp(order)).toEqual(latestRecordedCorp(order));
    }
  });
});
