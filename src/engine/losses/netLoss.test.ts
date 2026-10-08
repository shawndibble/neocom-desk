import { describe, expect, it } from 'vitest';
import { computeNetLoss, matchInsurance, type InsuranceJournalRow } from './netLoss';

const HULL = 100;
const victim = {
  ship_type_id: HULL,
  items: [
    { item_type_id: 1, flag: 27, quantity_destroyed: 1, singleton: 0 }, // high slot
    { item_type_id: 2, flag: 19, quantity_dropped: 1, singleton: 0 }, // mid slot, survived
    { item_type_id: 3, flag: 5, quantity_destroyed: 3, quantity_dropped: 2, singleton: 0 }, // cargo
  ],
};
const prices = new Map<number, number | null>([
  [HULL, 1000],
  [1, 10],
  [2, 20],
  [3, 5],
]);

describe('computeNetLoss', () => {
  it('prices hull, fitted modules and cargo (dropped included) and tracks the dropped share', () => {
    const loss = computeNetLoss({ victim, prices, insurance: null, zkbValue: 1200 });
    expect(loss.hull).toBe(1000);
    expect(loss.fitted).toBe(30);
    expect(loss.cargo).toBe(25);
    expect(loss.dropped).toBe(20 + 10);
    expect(loss.lost).toBe(1055);
    expect(loss.net).toBe(1055);
    expect(loss.insurance).toBeNull();
    expect(loss.zkbValue).toBe(1200);
    expect(loss.unpricedTypes).toEqual([]);
  });

  it('subtracts the insurance payout and keeps its estimate flag', () => {
    const loss = computeNetLoss({
      victim,
      prices,
      insurance: { amount: 400, estimate: true },
      zkbValue: null,
    });
    expect(loss.net).toBe(655);
    expect(loss.insurance).toEqual({ amount: 400, estimate: true });
  });

  it('lists unpriced types instead of treating them as free', () => {
    const loss = computeNetLoss({
      victim,
      prices: new Map([[HULL, 1000]]),
      insurance: null,
      zkbValue: null,
    });
    expect(loss.lost).toBe(1000);
    expect(loss.unpricedTypes).toEqual([1, 2, 3]);
  });
});

describe('matchInsurance', () => {
  const killTime = Date.parse('2026-10-01T12:00:00Z');
  const row = (
    id: number,
    date: string,
    amount: number,
    ref = 'insurance'
  ): InsuranceJournalRow => ({
    id,
    date,
    ref_type: ref,
    amount,
    description: '',
  });

  it('ignores premiums (negative amounts) and other ref types', () => {
    const rows = [
      row(1, '2026-10-01T11:59:00Z', -50),
      row(2, '2026-10-01T12:01:00Z', 900, 'player_donation'),
    ];
    expect(matchInsurance(rows, killTime)).toBeNull();
  });

  it('matches a single payout shortly after the kill as exact', () => {
    const rows = [row(1, '2026-10-01T12:00:05Z', 900), row(2, '2026-09-20T00:00:00Z', 700)];
    expect(matchInsurance(rows, killTime)).toEqual({ amount: 900, estimate: false });
  });

  it('labels an ambiguous match an estimate and picks the closest in time', () => {
    const rows = [row(1, '2026-10-01T12:00:30Z', 900), row(2, '2026-10-01T12:03:00Z', 300)];
    expect(matchInsurance(rows, killTime)).toEqual({ amount: 900, estimate: true });
  });
});
