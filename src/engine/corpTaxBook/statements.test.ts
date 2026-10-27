import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MINIMUM_STATEMENT,
  canRebillFrom,
  daysOnStatements,
  draftStatement,
  issueStatement,
  statementPeriod,
  type Statement,
  type StatementDraftInput,
} from './statements';
import type { DayCharge } from './charges';

const ORE = 45490;
const ORE_B = 45491;

function charge(date: string, quantity: number, overrides: Partial<DayCharge> = {}): DayCharge {
  // 1000 ISK/unit at 10%: 100 ISK tax per unit.
  return {
    key: `90000001:1001:${date}`,
    minerId: 'm1',
    characterId: 90000001,
    structureId: 1001,
    date,
    isGuest: false,
    oreLines: [{ typeId: ORE, quantity }],
    unitPrices: { [ORE]: 1000 },
    priceSources: { [ORE]: 'saved' },
    taxPct: 10,
    rateScope: 'corp',
    rateEffectiveFrom: '2026-01-01',
    estimatedValue: quantity * 1000,
    taxOwed: quantity * 100,
    ...overrides,
  };
}

const JULY = { start: '2026-07-01', end: '2026-07-31' };
const AUGUST = { start: '2026-08-01', end: '2026-08-31' };

function input(overrides: Partial<StatementDraftInput> = {}): StatementDraftInput {
  return {
    minerId: 'm1',
    startDate: '2026-07-01',
    period: JULY,
    charges: [],
    adjustments: [],
    issued: [],
    paidStatementIds: new Set(),
    dismissals: [],
    billableThrough: '2026-08-02',
    ...overrides,
  };
}

function issue(
  draftInput: StatementDraftInput,
  id: string,
  issuedAt = '2026-08-02T12:00:00Z'
): Statement {
  const draft = draftStatement(draftInput);
  if (draft.kind !== 'statement') throw new Error(`expected a statement, got ${draft.kind}`);
  return issueStatement(draft, {
    id,
    code: `NDT-${id}`,
    minerId: draftInput.minerId,
    period: draftInput.period,
    issuedAt,
    hubId: 'jita',
    oreForm: 'compressed',
  });
}

describe('statementPeriod', () => {
  it('is the calendar month by default', () => {
    expect(statementPeriod('2026-07-12')).toEqual(JULY);
    expect(statementPeriod('2026-02-03')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('can be a fixed number of days from an anchor', () => {
    const cadence = { kind: 'days' as const, days: 14, anchor: '2026-07-01' };
    expect(statementPeriod('2026-07-12', cadence)).toEqual({
      start: '2026-07-01',
      end: '2026-07-14',
    });
    expect(statementPeriod('2026-07-15', cadence)).toEqual({
      start: '2026-07-15',
      end: '2026-07-28',
    });
    expect(statementPeriod('2026-06-30', cadence)).toEqual({
      start: '2026-06-17',
      end: '2026-06-30',
    });
  });
});

describe('draftStatement', () => {
  it('bills every Billable day of the period as mined lines', () => {
    const draft = draftStatement(
      input({ charges: [charge('2026-07-10', 30_000), charge('2026-07-20', 40_000)] })
    );
    expect(draft.kind).toBe('statement');
    if (draft.kind !== 'statement') return;
    expect(draft.lines.map((l) => [l.kind, l.date, l.tax])).toEqual([
      ['mined', '2026-07-10', 3_000_000],
      ['mined', '2026-07-20', 4_000_000],
    ]);
    expect(draft.amount).toBe(7_000_000);
    expect(draft.coversFrom).toBe('2026-07-01');
    expect(draft.coversThrough).toBe('2026-07-31');
  });

  it('leaves out days that are not Billable yet, and days after the period', () => {
    const draft = draftStatement(
      input({
        billableThrough: '2026-07-25',
        charges: [
          charge('2026-07-10', 60_000),
          charge('2026-07-28', 10_000),
          charge('2026-08-01', 10_000),
        ],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines.map((l) => l.date)).toEqual(['2026-07-10']);
    expect(draft.coversThrough).toBe('2026-07-25');
  });

  it('has nothing to bill with no sync after the grace', () => {
    expect(
      draftStatement(input({ billableThrough: undefined, charges: [charge('2026-07-10', 60_000)] }))
        .kind
    ).toBe('nothing');
  });

  it('rolls a period under the 5M minimum into the next period', () => {
    expect(DEFAULT_MINIMUM_STATEMENT).toBe(5_000_000);
    const july = input({ charges: [charge('2026-07-10', 40_000)] });
    const draft = draftStatement(july);
    expect(draft).toMatchObject({ kind: 'rolled-over', amount: 4_000_000 });

    const august = draftStatement(
      input({
        period: AUGUST,
        billableThrough: '2026-09-02',
        charges: [charge('2026-07-10', 40_000), charge('2026-08-05', 20_000)],
      })
    );
    if (august.kind !== 'statement') throw new Error(august.kind);
    expect(august.lines.map((l) => [l.kind, l.date])).toEqual([
      ['mined', '2026-07-10'],
      ['mined', '2026-08-05'],
    ]);
    expect(august.amount).toBe(6_000_000);
  });

  it('honours a changed minimum, and a final Statement ignores it', () => {
    const small = input({ charges: [charge('2026-07-10', 10_000)] });
    expect(draftStatement({ ...small, minimumAmount: 500_000 }).kind).toBe('statement');
    expect(draftStatement({ ...small, final: true }).kind).toBe('statement');
  });

  it('never changes an issued Statement: late ore on an unpaid day goes on the next one as a labelled line', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    const draft = draftStatement(
      input({
        period: AUGUST,
        billableThrough: '2026-09-02',
        issued: [july],
        charges: [
          charge('2026-07-10', 61_000, {
            oreLines: [
              { typeId: ORE, quantity: 61_000 },
              { typeId: ORE_B, quantity: 10 },
            ],
            unitPrices: { [ORE]: 1000, [ORE_B]: 500 },
          }),
          charge('2026-07-15', 50_000),
          charge('2026-08-05', 1_000),
        ],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(
      draft.lines.map((l) => ({ kind: l.kind, date: l.date, tax: l.tax, ore: l.oreLines }))
    ).toEqual([
      {
        kind: 'late-ore',
        date: '2026-07-10',
        // 1000 more units at 1000 + 10 at 500, at 10%.
        tax: 100_500,
        ore: [
          { typeId: ORE, quantity: 1_000 },
          { typeId: ORE_B, quantity: 10 },
        ],
      },
      {
        kind: 'late-ore',
        date: '2026-07-15',
        tax: 5_000_000,
        ore: [{ typeId: ORE, quantity: 50_000 }],
      },
      { kind: 'mined', date: '2026-08-05', tax: 100_000, ore: [{ typeId: ORE, quantity: 1_000 }] },
    ]);
    expect(july.amount).toBe(6_000_000);
    expect(draft.coversFrom).toBe('2026-08-01');
  });

  it('closes a paid Statement’s days for good: late ore there is written off, never billed', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    const draft = draftStatement(
      input({
        period: AUGUST,
        billableThrough: '2026-09-02',
        issued: [july],
        paidStatementIds: new Set(['s1']),
        charges: [
          charge('2026-07-10', 61_000),
          charge('2026-07-15', 500),
          charge('2026-08-05', 60_000),
        ],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines.map((l) => l.date)).toEqual(['2026-08-05']);
    expect(draft.writtenOff).toEqual([
      {
        reason: 'recorded-after-payment',
        statementId: 's1',
        chargeKey: '90000001:1001:2026-07-10',
        date: '2026-07-10',
        oreLines: [{ typeId: ORE, quantity: 1_000 }],
        estimatedValue: 1_000_000,
        tax: 100_000,
      },
      {
        reason: 'recorded-after-payment',
        statementId: 's1',
        chargeKey: '90000001:1001:2026-07-15',
        date: '2026-07-15',
        oreLines: [{ typeId: ORE, quantity: 500 }],
        estimatedValue: 500_000,
        tax: 50_000,
      },
    ]);
  });

  it('bills an officer correction once, on the next Statement, as a labelled line', () => {
    const adjustment = {
      id: 'a1',
      minerId: 'm1',
      date: '2026-07-10',
      amount: -250_000,
      reason: 'Wrong refinery',
      by: 95000001,
      at: '2026-08-03T00:00:00Z',
    };
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    const augustInput = input({
      period: AUGUST,
      billableThrough: '2026-09-02',
      issued: [july],
      adjustments: [adjustment],
      charges: [charge('2026-07-10', 60_000), charge('2026-08-05', 60_000)],
    });
    const august = draftStatement(augustInput);
    if (august.kind !== 'statement') throw new Error(august.kind);
    expect(august.lines.find((l) => l.kind === 'correction')).toMatchObject({
      adjustmentId: 'a1',
      tax: -250_000,
      reason: 'Wrong refinery',
    });
    expect(august.amount).toBe(5_750_000);

    const issuedAugust = issueStatement(august, {
      id: 's2',
      code: 'NDT-s2',
      hubId: 'jita',
      oreForm: 'compressed',
      minerId: 'm1',
      period: AUGUST,
      issuedAt: '2026-09-02T12:00:00Z',
    });
    const september = draftStatement({
      ...augustInput,
      period: { start: '2026-09-01', end: '2026-09-30' },
      billableThrough: '2026-10-02',
      issued: [july, issuedAugust],
      charges: [...augustInput.charges, charge('2026-09-05', 60_000)],
    });
    if (september.kind !== 'statement') throw new Error(september.kind);
    expect(september.lines.map((l) => [l.kind, l.date])).toEqual([['mined', '2026-09-05']]);
  });

  it('leaves dismissed days off and lists them separately', () => {
    const draft = draftStatement(
      input({
        charges: [charge('2026-07-10', 60_000), charge('2026-07-11', 60_000)],
        dismissals: [
          {
            id: 'd1',
            scope: 'record',
            targetId: '90000001:1001:2026-07-11',
            by: 95000001,
            at: '2026-07-20T00:00:00Z',
            reason: 'Fleet op',
          },
        ],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines.map((l) => l.date)).toEqual(['2026-07-10']);
    expect(draft.dismissed.map((d) => d.charge.date)).toEqual(['2026-07-11']);
  });

  it('only bills the Miner it is drafting for', () => {
    const draft = draftStatement(
      input({ charges: [charge('2026-07-10', 60_000, { minerId: 'm2' })] })
    );
    expect(draft.kind).toBe('nothing');
  });
});

describe('draftStatement (review follow-ups)', () => {
  const correction = (date: string, amount: number) => ({
    id: `a-${date}`,
    minerId: 'm1',
    date,
    amount,
    reason: 'Officer fix',
    by: 95000001,
    at: '2026-08-03T00:00:00Z',
  });

  it('freezes what the mail prints: rate, its effective date, price sources, hub and Ore Form', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    expect(july).toMatchObject({ hubId: 'jita', oreForm: 'compressed' });
    expect(july.lines[0]).toMatchObject({
      taxPct: 10,
      rateEffectiveFrom: '2026-01-01',
      unitPrices: { [ORE]: 1000 },
      priceSources: { [ORE]: 'saved' },
    });
  });

  it('holds a correction dated after the last Billable day for a later Statement', () => {
    const draft = draftStatement(
      input({
        billableThrough: '2026-07-29',
        charges: [charge('2026-07-10', 60_000)],
        adjustments: [correction('2026-07-30', 100_000)],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines.map((l) => l.kind)).toEqual(['mined']);
  });

  it('a correction line never adds its day to the days a Statement covered', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    const august = issue(
      input({
        period: AUGUST,
        billableThrough: '2026-08-10',
        issued: [july],
        charges: [charge('2026-08-05', 60_000)],
        adjustments: [correction('2026-07-10', -100_000)],
      }),
      's2'
    );
    expect(daysOnStatements([august]).has('2026-07-10')).toBe(false);
  });

  it('does not bill a positive correction on a paid Statement’s day, and says so', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    const draft = draftStatement(
      input({
        period: AUGUST,
        billableThrough: '2026-09-02',
        issued: [july],
        paidStatementIds: new Set(['s1']),
        charges: [charge('2026-08-05', 60_000)],
        adjustments: [correction('2026-07-10', 100_000), correction('2026-07-11', -50_000)],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines.map((l) => [l.kind, l.tax])).toEqual([
      ['correction', -50_000],
      ['mined', 6_000_000],
    ]);
    expect(draft.blockedCorrections.map((a) => a.id)).toEqual(['a-2026-07-10']);
  });

  it('ignores another Miner’s issued Statements', () => {
    const other = {
      ...issue(input({ charges: [charge('2026-07-10', 60_000)] }), 'sX'),
      minerId: 'm2',
    };
    const draft = draftStatement(
      input({ issued: [other], charges: [charge('2026-07-10', 60_000)] })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines.map((l) => l.kind)).toEqual(['mined']);
  });

  it('leaves late ore off a billed day that was dismissed since', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    const draft = draftStatement(
      input({
        period: AUGUST,
        billableThrough: '2026-09-02',
        issued: [july],
        charges: [charge('2026-07-10', 61_000), charge('2026-08-05', 60_000)],
        dismissals: [
          {
            id: 'd1',
            scope: 'record',
            targetId: '90000001:1001:2026-07-10',
            by: 95000001,
            at: '2026-08-03T00:00:00Z',
            reason: 'Fleet op',
          },
        ],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines.map((l) => l.date)).toEqual(['2026-08-05']);
    expect(draft.dismissed.map((d) => d.charge.date)).toEqual(['2026-07-10']);
  });

  it('prices late ore at the unit prices its day was first billed at', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    const draft = draftStatement(
      input({
        period: AUGUST,
        billableThrough: '2026-09-02',
        issued: [july],
        // Repriced since (live → saved): the bill keeps the first price.
        charges: [
          charge('2026-07-10', 61_000, { unitPrices: { [ORE]: 2000 } }),
          charge('2026-08-05', 60_000),
        ],
      })
    );
    if (draft.kind !== 'statement') throw new Error(draft.kind);
    expect(draft.lines[0]).toMatchObject({
      kind: 'late-ore',
      tax: 100_000,
      unitPrices: { [ORE]: 1000 },
    });
  });
});

describe('daysOnStatements', () => {
  it('is every day a Statement covered, plus the earlier days its lines billed', () => {
    const july = issue(
      input({ billableThrough: '2026-07-03', charges: [charge('2026-07-02', 60_000)] }),
      's1'
    );
    expect([...daysOnStatements([july])].sort()).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
  });
});

describe('canRebillFrom', () => {
  it('can never reach back into a paid Statement', () => {
    const july = issue(input({ charges: [charge('2026-07-10', 60_000)] }), 's1');
    expect(canRebillFrom('2026-07-20', [july], new Set(['s1']))).toBe(false);
    expect(canRebillFrom('2026-08-01', [july], new Set(['s1']))).toBe(true);
    expect(canRebillFrom('2026-07-20', [july], new Set())).toBe(true);
  });
});
