import { describe, it, expect } from 'vitest';
import {
  buildAppraisal,
  buildHubComparison,
  computeAppraisalRefine,
  type AppraisalItem,
} from '@/engine/market/appraisal';
import { BASE_STATION_REPROCESSING_RATE } from '@/engine/industry/reprocessing';

const NO_SKILLS = { reprocessingLevel: 0, reprocessingEfficiencyLevel: 0, specialisationLevel: 0 };

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
    expect(totals).toEqual({
      buy: 0,
      sell: 0,
      spread: 0,
      unpricedRows: 0,
      refine: 0,
      refineUnpricedRows: 0,
    });
  });

  it('preserves the order it was given', () => {
    const { rows } = buildAppraisal([tritanium, damageControl], 90);
    expect(rows.map((row) => row.name)).toEqual(['Tritanium', 'Damage Control II']);
  });

  describe('refine-then-sell', () => {
    it('leaves a row with no reprocessing data without a refine value', () => {
      const { rows, totals } = buildAppraisal([damageControl], 100);
      expect(rows[0].refineTotal).toBeUndefined();
      expect(rows[0].refinePricedAll).toBeUndefined();
      expect(totals.refine).toBe(0);
      expect(totals.refineUnpricedRows).toBe(0);
    });

    it('scales the refine value by the price percent, same as the other totals', () => {
      const ore: AppraisalItem = {
        ...tritanium,
        refine: { valueAtFullPrice: 1000, pricedAll: true, unitsLeftOver: 0 },
      };
      const { rows, totals } = buildAppraisal([ore], 90);
      expect(rows[0].refineTotal).toBeCloseTo(900, 6);
      expect(totals.refine).toBeCloseTo(900, 6);
    });

    it('carries the partial-pricing and leftover-units signal onto the row', () => {
      const ore: AppraisalItem = {
        ...tritanium,
        refine: { valueAtFullPrice: 500, pricedAll: false, unitsLeftOver: 3 },
      };
      const { rows, totals } = buildAppraisal([ore], 100);
      expect(rows[0].refinePricedAll).toBe(false);
      expect(rows[0].refineUnitsLeftOver).toBe(3);
      expect(totals.refineUnpricedRows).toBe(1);
    });

    it('sums the refine total only over rows carrying reprocessing data', () => {
      const ore: AppraisalItem = {
        ...tritanium,
        refine: { valueAtFullPrice: 500, pricedAll: true, unitsLeftOver: 0 },
      };
      const { totals } = buildAppraisal([damageControl, ore], 100);
      expect(totals.refine).toBe(500);
    });
  });
});

describe('computeAppraisalRefine', () => {
  const veldspar = {
    portionSize: 100,
    materials: [{ typeId: 34, quantity: 415 }],
  };

  it('is undefined when the type carries no reprocessing data', () => {
    expect(
      computeAppraisalRefine({
        quantity: 1000,
        reprocessing: undefined,
        skills: NO_SKILLS,
        materialPrices: {},
      })
    ).toBeUndefined();
  });

  it('refines the pasted quantity at the station base rate with no skills trained', () => {
    const refine = computeAppraisalRefine({
      quantity: 1000,
      reprocessing: veldspar,
      skills: NO_SKILLS,
      materialPrices: { 34: 5 },
    });
    // 10 batches x floor(415 x 10 x 0.5) Tritanium x 5 ISK
    expect(refine).toEqual({
      valueAtFullPrice: Math.floor(415 * 10 * BASE_STATION_REPROCESSING_RATE) * 5,
      pricedAll: true,
      unitsLeftOver: 0,
    });
  });

  it('reports a part-portion quantity as zero units refined, not omitted', () => {
    const refine = computeAppraisalRefine({
      quantity: 50,
      reprocessing: veldspar,
      skills: NO_SKILLS,
      materialPrices: { 34: 5 },
    });
    expect(refine).toEqual({ valueAtFullPrice: 0, pricedAll: true, unitsLeftOver: 50 });
  });

  it('flags an unpriced output material rather than pricing it as free', () => {
    const refine = computeAppraisalRefine({
      quantity: 1000,
      reprocessing: veldspar,
      skills: NO_SKILLS,
      materialPrices: {},
    });
    expect(refine).toEqual({ valueAtFullPrice: 0, pricedAll: false, unitsLeftOver: 0 });
  });
});

describe('buildHubComparison', () => {
  it('totals both sides at the given percentage, same as buildAppraisal', () => {
    const { buy, sell } = buildHubComparison([damageControl, tritanium], 90);
    expect(buy).toBeCloseTo(1_952_140.5, 3);
    expect(sell).toBeCloseTo(2_012_121, 3);
  });

  it('reports a side as null rather than zero when nothing priced on it', () => {
    const unlisted: AppraisalItem = {
      typeId: 99,
      name: 'Civilian Gatling Railgun',
      quantity: 4,
      buy: null,
      sell: 1_000,
    };
    const { buy, sell } = buildHubComparison([unlisted], 100);
    expect(buy).toBeNull();
    expect(sell).toBe(4_000);
  });

  it('reports both sides as null for an empty item list', () => {
    expect(buildHubComparison([], 100)).toEqual({ buy: null, sell: null });
  });

  it('totals a side with at least one priced item among several unpriced ones', () => {
    const noBuy: AppraisalItem = { typeId: 98, name: 'A', quantity: 1, buy: null, sell: 10 };
    const { buy } = buildHubComparison([damageControl, noBuy], 100);
    expect(buy).toBe(damageControl.buy! * damageControl.quantity);
  });
});
