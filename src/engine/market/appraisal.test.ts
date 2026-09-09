import { describe, it, expect } from 'vitest';
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';

const damageControl: AppraisalItem = {
  typeId: 2048,
  name: 'Damage Control II',
  quantity: 3,
  buy: 498_500,
  sell: 512_000,
};

const tritanium: AppraisalItem = {
  typeId: 34,
  name: 'Tritanium',
  quantity: 124_500,
  buy: 5.41,
  sell: 5.62,
};

describe('buildAppraisal', () => {
  it('prices each side at the given percentage of market', () => {
    const { rows } = buildAppraisal([damageControl], 90);
    expect(rows[0].buyEach).toBe(448_650);
    expect(rows[0].sellEach).toBe(460_800);
    expect(rows[0].buyTotal).toBe(1_345_950);
    expect(rows[0].sellTotal).toBe(1_382_400);
  });

  it('leaves prices untouched at 100%', () => {
    const { rows } = buildAppraisal([damageControl], 100);
    expect(rows[0].buyEach).toBe(498_500);
    expect(rows[0].sellTotal).toBe(1_536_000);
  });

  it('carries identity and quantity through unchanged', () => {
    const { rows } = buildAppraisal([damageControl], 90);
    expect(rows[0].typeId).toBe(2048);
    expect(rows[0].name).toBe('Damage Control II');
    expect(rows[0].quantity).toBe(3);
  });

  it('keeps sub-ISK unit prices unrounded, so totals are not rounded twice', () => {
    const { rows } = buildAppraisal([tritanium], 90);
    expect(rows[0].sellEach).toBeCloseTo(5.058, 6);
    expect(rows[0].sellTotal).toBeCloseTo(629_721, 3);
  });

  it('totals both sides and reports the spread between them', () => {
    const { totals } = buildAppraisal([damageControl, tritanium], 90);
    expect(totals.buy).toBeCloseTo(1_952_140.5, 3);
    expect(totals.sell).toBeCloseTo(2_012_121, 3);
    expect(totals.spread).toBeCloseTo(totals.sell - totals.buy, 6);
  });

  /**
   * `HubAggregate` reports an unlisted side as null, never 0
   * (`market/fuzzwork.ts`). `null * qty` is 0 in JS, so a total that summed
   * blindly would price an item nobody sells as free.
   */
  it('reports an unpriced side as null rather than zero', () => {
    const unlisted: AppraisalItem = {
      typeId: 99,
      name: 'Civilian Gatling Railgun',
      quantity: 4,
      buy: null,
      sell: 1_000,
    };
    const { rows } = buildAppraisal([unlisted], 100);
    expect(rows[0].buyEach).toBeNull();
    expect(rows[0].buyTotal).toBeNull();
    expect(rows[0].sellTotal).toBe(4_000);
  });

  it('leaves an unpriced side out of that side’s total', () => {
    const unlisted: AppraisalItem = {
      typeId: 99,
      name: 'Civilian Gatling Railgun',
      quantity: 4,
      buy: null,
      sell: 1_000,
    };
    const { totals } = buildAppraisal([damageControl, unlisted], 100);
    expect(totals.buy).toBe(1_495_500);
    expect(totals.sell).toBe(1_540_000);
  });

  it('counts the rows missing a price on either side', () => {
    const noBuy: AppraisalItem = { typeId: 99, name: 'A', quantity: 1, buy: null, sell: 10 };
    const noSell: AppraisalItem = { typeId: 98, name: 'B', quantity: 1, buy: 10, sell: null };
    const neither: AppraisalItem = { typeId: 97, name: 'C', quantity: 1, buy: null, sell: null };
    const { totals } = buildAppraisal([damageControl, noBuy, noSell, neither], 100);
    expect(totals.unpricedRows).toBe(3);
  });

  it('prices everything at zero when the percentage is zero', () => {
    const { rows, totals } = buildAppraisal([damageControl], 0);
    expect(rows[0].buyEach).toBe(0);
    expect(rows[0].sellTotal).toBe(0);
    expect(totals.sell).toBe(0);
  });

  it('accepts a percentage above 100', () => {
    const { rows } = buildAppraisal([damageControl], 110);
    expect(rows[0].buyEach).toBeCloseTo(548_350, 6);
  });

  it('accepts a fractional percentage', () => {
    const { rows } = buildAppraisal([damageControl], 92.5);
    expect(rows[0].buyEach).toBeCloseTo(461_112.5, 6);
  });

  it('totals to zero for an empty list', () => {
    const { rows, totals } = buildAppraisal([], 90);
    expect(rows).toEqual([]);
    expect(totals).toEqual({ buy: 0, sell: 0, spread: 0, unpricedRows: 0 });
  });

  it('preserves the order it was given', () => {
    const { rows } = buildAppraisal([tritanium, damageControl], 90);
    expect(rows.map((row) => row.name)).toEqual(['Tritanium', 'Damage Control II']);
  });
});
