/**
 * One month of a Corp Tax Book end to end, through the public functions in
 * the order a caller uses them: observer sync → Observed Mining Entries →
 * day charges → Statement → Tax Payments → Overdue.
 */
import { describe, it, expect } from 'vitest';
import { groupObservedEntries, mergeObservedRows } from './observed';
import { lastBillableDate } from './billable';
import { priceObservedDay } from './valuation';
import { buildDayCharges } from './charges';
import { draftStatement, issueStatement, statementPeriod } from './statements';
import { allocatePayments, matchDonation } from './allocation';
import { overdueStatus } from './overdue';

const CORP = 98000001;
const RAW = 45490;
const COMPRESSED = 62516;

describe('a month of the Corp Tax Book', () => {
  it('bills what the refinery recorded at the personal tab’s price and settles from a donation', () => {
    const synced = mergeObservedRows(
      [],
      [
        {
          structureId: 1001,
          characterId: 90000001,
          recordedCorporationId: CORP,
          typeId: RAW,
          date: '2026-07-12',
          quantity: 40_000,
          cachedAt: '2026-07-12T20:00:00Z',
        },
      ]
    );
    const later = mergeObservedRows(synced.rows, [
      { ...synced.rows[0], quantity: 50_000, cachedAt: '2026-07-13T02:00:00Z' },
    ]);
    const entries = groupObservedEntries(later.rows);

    const day = priceObservedDay([RAW], {
      ore: { compressedByRaw: { [String(RAW)]: COMPRESSED }, compressed: true },
      saved: [{ [COMPRESSED]: { buy: 1_200, sell: 1_300 } }],
    });
    const { charges } = buildDayCharges(entries, {
      corporationId: CORP,
      startDate: '2026-07-01',
      miners: [],
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-07-01' }],
      pricesOn: () => day,
      placeOf: () => ({}),
    });
    // 50,000 × 1,200 = 60M; 10% = 6M — the same as computeAssignmentValue in the personal tab.
    expect(charges[0].taxOwed).toBe(6_000_000);

    const period = statementPeriod('2026-07-12');
    const draft = draftStatement({
      minerId: charges[0].minerId,
      startDate: '2026-07-01',
      period,
      charges,
      adjustments: [],
      issued: [],
      paidStatementIds: new Set(),
      dismissals: [],
      billableThrough: lastBillableDate({
        now: '2026-08-02T00:00:00Z',
        lastSyncedAt: '2026-08-01T07:00:00Z',
      }),
    });
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    const statement = issueStatement(draft, {
      id: 's1',
      code: 'NDT-7Q2K',
      minerId: charges[0].minerId,
      period,
      issuedAt: '2026-08-02T00:00:00Z',
      hubId: 'jita',
      oreForm: 'compressed',
    });

    const match = matchDonation(
      { characterId: 90000001, reason: 'moon tax' },
      { miners: [], statements: [statement], knownCharacterIds: new Set([90000001]) }
    );
    expect(match).toEqual({ kind: 'miner', minerId: 'solo:90000001' });

    const allocation = allocatePayments({
      statements: [statement],
      payments: [
        {
          id: 'j1',
          minerId: 'solo:90000001',
          characterId: 90000001,
          amount: 5_980_000,
          at: '2026-08-05T00:00:00Z',
          source: 'donation',
        },
      ],
      dismissalCredits: [],
    });
    expect(allocation.byStatement.get('s1')).toMatchObject({ settled: true, writtenOff: 20_000 });
    expect(
      overdueStatus({
        issuedAt: statement.issuedAt,
        settled: true,
        now: '2026-09-01T00:00:00Z',
        declarations: [],
      }).state
    ).toBe('settled');
  });
});
