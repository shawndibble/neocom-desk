import { DAY_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import type { DayCharge } from './charges';
import {
  DISPUTE_HOLD_DAYS,
  disputeHold,
  disputeKindOf,
  disputedTax,
  disputesToShow,
  readDisputes,
  type OreDispute,
} from './disputes';
import type { Dismissal } from './dismissals';

const dispute = (overrides: Partial<OreDispute> = {}): OreDispute => ({
  id: 'm-a_2026-11-01',
  minerId: 'm-a',
  date: '2026-11-01',
  lines: [
    { recordKey: '60:1000:2026-11-01', typeId: 45490, quantity: 100, payeeName: 'Rival Corp' },
    { recordKey: '77:1000:2026-11-01', typeId: 45491, quantity: 50, payeeName: 'Rival Corp' },
  ],
  by: 60,
  at: '2026-11-03T00:00:00.000Z',
  ...overrides,
});

const dismissal = (targetId: string, overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: `d-${targetId}`,
  scope: 'record',
  targetId,
  by: 1,
  at: '2026-11-04T00:00:00.000Z',
  reason: 'their ore',
  ...overrides,
});

describe('disputesToShow (#6206)', () => {
  it('shows a dispute nobody answered, oldest day first', () => {
    const later = dispute({ id: 'm-b_2026-11-02', minerId: 'm-b', date: '2026-11-02' });
    expect(disputesToShow([later, dispute()], []).map((d) => d.id)).toEqual([
      'm-a_2026-11-01',
      'm-b_2026-11-02',
    ]);
  });

  it('drops one an officer rejected', () => {
    const rejected = dispute({
      resolution: { kind: 'rejected', at: '2026-11-04T00:00:00.000Z', by: 1, reason: 'ours' },
    });
    expect(disputesToShow([rejected], [])).toEqual([]);
  });

  it('drops a day once every line is dismissed, and keeps it while one is not', () => {
    const one = [dismissal('60:1000:2026-11-01')];
    expect(disputesToShow([dispute()], one)).toHaveLength(1);
    const both = [...one, dismissal('77:1000:2026-11-01')];
    expect(disputesToShow([dispute()], both)).toEqual([]);
    expect(disputesToShow([dispute()], [dismissal('m-a', { scope: 'miner' })])).toEqual([]);
    const reversed = both.map((d) => ({
      ...d,
      reversed: { by: 1, at: '2026-11-05T00:00:00.000Z' },
    }));
    expect(disputesToShow([dispute()], reversed)).toHaveLength(1);
  });
});

describe('readDisputes', () => {
  it('keeps well-formed docs and drops the rest', () => {
    expect(readDisputes([dispute(), { id: 'x' }, null])).toEqual([dispute()]);
  });
});

describe('disputedTax (#6206)', () => {
  const charge = (key: string, oreLines: { typeId: number; quantity: number }[]) =>
    ({
      key,
      oreLines,
      unitPrices: { 45490: 1000, 45491: 2000, 45492: 5000 },
      taxPct: 10,
      taxOwed: 0,
    }) as unknown as DayCharge;

  it('prices only the disputed ore, at the day charge’s prices and rate', () => {
    const charges = [
      charge('60:1000:2026-11-01', [
        { typeId: 45490, quantity: 100 },
        { typeId: 45492, quantity: 999 },
      ]),
      charge('77:1000:2026-11-01', [{ typeId: 45491, quantity: 50 }]),
    ];
    expect(disputedTax(dispute(), charges)).toBe(20_000);
  });

  it('never prices more ore than the charge holds', () => {
    const charges = [
      charge('60:1000:2026-11-01', [{ typeId: 45490, quantity: 40 }]),
      charge('77:1000:2026-11-01', [{ typeId: 45491, quantity: 50 }]),
    ];
    expect(disputedTax(dispute(), charges)).toBe(4_000 + 10_000);
  });

  it('is unknown while a disputed day has no charge in view', () => {
    expect(disputedTax(dispute(), [charge('60:1000:2026-11-01', [])])).toBeUndefined();
    const unpriced = {
      ...charge('60:1000:2026-11-01', [{ typeId: 45490, quantity: 100 }]),
      unitPrices: {},
    } as DayCharge;
    expect(
      disputedTax(dispute(), [
        unpriced,
        charge('77:1000:2026-11-01', [{ typeId: 45491, quantity: 50 }]),
      ])
    ).toBeUndefined();
  });
});

describe('a waived dispute (#6206)', () => {
  const waived = {
    kind: 'dismissed' as const,
    at: '2026-11-04T00:00:00.000Z',
    by: 1,
    reason: 'theirs',
    amountIsk: 20_000,
  };

  it('reads back and leaves Needs you', () => {
    const [read] = readDisputes([dispute({ resolution: waived })]);
    expect(read.resolution).toEqual(waived);
    expect(disputesToShow([read], [])).toEqual([]);
  });
});

describe('dispute kinds (resolve in the app)', () => {
  it('reads a dispute stored before kinds as a payee dispute', () => {
    expect(disputeKindOf(dispute())).toBe('payee');
  });

  it('reads back a kind, the member reason and a claimed rate', () => {
    const [read] = readDisputes([
      { ...dispute(), kind: 'rate', reason: 'We agreed 10%', claimedPct: 10 },
    ]);
    expect(read).toMatchObject({ kind: 'rate', reason: 'We agreed 10%', claimedPct: 10 });
  });

  it('drops an unknown kind back to payee rather than losing the dispute', () => {
    const [read] = readDisputes([{ ...dispute(), kind: 'mystery' }]);
    expect(disputeKindOf(read)).toBe('payee');
  });

  it("reads back the officer's next step on a kept bill", () => {
    const [read] = readDisputes([
      {
        ...dispute(),
        resolution: {
          kind: 'rejected',
          at: '2026-11-04T00:00:00.000Z',
          by: 1,
          reason: 'Book stands',
          nextStep: 'Send the journal screenshot to Imra',
        },
      },
    ]);
    expect(read.resolution).toMatchObject({ nextStep: 'Send the journal screenshot to Imra' });
  });
});

describe('disputedTax on a rate dispute', () => {
  const charge = {
    key: '60:1000:2026-11-01',
    oreLines: [{ typeId: 45490, quantity: 100 }],
    unitPrices: { 45490: 1000 },
    taxPct: 12,
  };

  it('prices the gap between the billed rate and the claimed one', () => {
    const rate = dispute({
      kind: 'rate',
      claimedPct: 10,
      lines: [{ recordKey: charge.key, typeId: 45490, quantity: 100, payeeName: '' }],
    });
    expect(disputedTax(rate, [charge])).toBeCloseTo(100 * 1000 * 0.02);
  });

  it('credits nothing when the claimed rate is not lower', () => {
    const rate = dispute({
      kind: 'rate',
      claimedPct: 15,
      lines: [{ recordKey: charge.key, typeId: 45490, quantity: 100, payeeName: '' }],
    });
    expect(disputedTax(rate, [charge])).toBe(0);
  });
});

describe('disputeHold', () => {
  const at = '2026-11-03T00:00:00.000Z';

  it('holds an unanswered dispute until 14 days after it was raised', () => {
    const hold = disputeHold(dispute({ at }), '2026-11-05T00:00:00.000Z');
    expect(hold).toEqual({
      until: new Date(Date.parse(at) + DISPUTE_HOLD_DAYS * DAY_MS).toISOString(),
    });
  });

  it('lapses once the 14 days are up, so the day is owed as before', () => {
    const late = new Date(Date.parse(at) + DISPUTE_HOLD_DAYS * DAY_MS).toISOString();
    expect(disputeHold(dispute({ at }), late)).toBeUndefined();
  });

  it('holds nothing an officer has answered', () => {
    const answered = dispute({
      at,
      resolution: { kind: 'rejected', at: '2026-11-04T00:00:00.000Z', by: 1, reason: 'ours' },
    });
    expect(disputeHold(answered, '2026-11-05T00:00:00.000Z')).toBeUndefined();
  });
});

describe('a dispute filed again after a kept bill', () => {
  const kept = {
    kind: 'rejected' as const,
    at: '2026-11-04T00:00:00.000Z',
    by: 1,
    reason: 'ours',
    nextStep: 'Pay it',
  };

  it('keeps the first dispute’s hold window, never renewing it', () => {
    const again = dispute({ at: '2026-11-10T00:00:00.000Z', holdFrom: '2026-11-03T00:00:00.000Z' });
    expect(disputeHold(again, '2026-11-12T00:00:00.000Z')).toEqual({
      until: '2026-11-17T00:00:00.000Z',
    });
    expect(disputeHold(again, '2026-11-17T00:00:00.000Z')).toBeUndefined();
  });

  it('reads the hold start and the earlier answers kept in history', () => {
    const [read] = readDisputes([
      {
        ...dispute({ holdFrom: '2026-11-03T00:00:00.000Z' }),
        history: [{ kind: 'quantity', reason: 'too much', resolution: kept }, { kind: 'rate' }, 3],
      },
    ]);
    expect(read.holdFrom).toBe('2026-11-03T00:00:00.000Z');
    expect(read.history).toEqual([{ kind: 'quantity', reason: 'too much', resolution: kept }]);
    expect(readDisputes([{ ...dispute(), holdFrom: 'soon' }])[0].holdFrom).toBeUndefined();
  });
});
