import { describe, it, expect } from 'vitest';
import {
  buildAppraisal,
  buildHubComparison,
  computeAppraisalRefine,
  lpBeatsMarket,
  refineBeatsSellAsIs,
  type AppraisalItem,
  type AppraisalRow,
} from '@/engine/market/appraisal';
import { BASE_STATION_REPROCESSING_RATE } from '@/engine/industry/reprocessing';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';

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
      cheapestBuy: 0,
      cheapestBuyViaLp: 0,
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

  describe('LP store acquisition', () => {
    const astero: AppraisalItem = {
      typeId: 33468,
      name: 'Astero',
      quantity: 1,
      buy: 60_000_000,
      // No blueprint exists for a faction hull like this — market sell is
      // whatever the last player reseller asked, here worse than LP.
      sell: 95_000_000,
      lpOption: {
        corporationId: 1000125,
        corpName: 'Sisters of EVE',
        lpCost: 400_000,
        iskCost: 850_000,
        affordableLp: true,
      },
    };

    it('carries the LP option through onto the row', () => {
      const { rows } = buildAppraisal([astero], 100);
      expect(rows[0].lpCorporationId).toBe(1000125);
      expect(rows[0].lpCorpName).toBe('Sisters of EVE');
      expect(rows[0].lpCost).toBe(400_000);
      expect(rows[0].lpIskCost).toBe(850_000);
      expect(rows[0].lpAffordable).toBe(true);
    });

    it('is undefined on a row nothing the character holds LP with sells', () => {
      const { rows } = buildAppraisal([damageControl], 100);
      expect(rows[0].lpCorpName).toBeUndefined();
      expect(rows[0].lpIskCost).toBeUndefined();
    });

    it('never scales the LP ISK cost by the price percent — it is a fixed NPC price', () => {
      const { rows } = buildAppraisal([astero], 50);
      expect(rows[0].lpIskCost).toBe(850_000);
    });

    it('counts the cheaper affordable LP option into cheapestBuy instead of the market sell total', () => {
      const { totals } = buildAppraisal([astero], 100);
      expect(totals.sell).toBe(95_000_000); // market total is untouched
      expect(totals.cheapestBuy).toBe(850_000);
      expect(totals.cheapestBuyViaLp).toBe(1);
    });

    it('falls back to the market total when the LP offer is not affordable', () => {
      const unaffordable: AppraisalItem = {
        ...astero,
        lpOption: { ...astero.lpOption!, affordableLp: false },
      };
      const { totals } = buildAppraisal([unaffordable], 100);
      expect(totals.cheapestBuy).toBe(95_000_000);
      expect(totals.cheapestBuyViaLp).toBe(0);
    });

    it('falls back to the market total when the LP offer is affordable but pricier', () => {
      const pricier: AppraisalItem = {
        ...astero,
        lpOption: { ...astero.lpOption!, iskCost: 200_000_000 },
      };
      const { totals } = buildAppraisal([pricier], 100);
      expect(totals.cheapestBuy).toBe(95_000_000);
      expect(totals.cheapestBuyViaLp).toBe(0);
    });

    it('uses the LP option when nobody is selling on the market at all', () => {
      const noMarket: AppraisalItem = { ...astero, sell: null };
      const { rows, totals } = buildAppraisal([noMarket], 100);
      expect(rows[0].sellTotal).toBeNull();
      expect(totals.cheapestBuy).toBe(850_000);
      expect(totals.cheapestBuyViaLp).toBe(1);
    });

    it('sums cheapestBuy across a mix of LP-cheaper and market-cheaper rows', () => {
      const { totals } = buildAppraisal([astero, damageControl], 100);
      expect(totals.cheapestBuy).toBe(850_000 + 1_536_000);
    });
  });
});

describe('lpBeatsMarket', () => {
  function row(overrides: Partial<AppraisalRow> = {}): AppraisalRow {
    return {
      typeId: 33468,
      name: 'Astero',
      quantity: 1,
      buyEach: 60_000_000,
      sellEach: 95_000_000,
      buyTotal: 60_000_000,
      sellTotal: 95_000_000,
      lpCorpName: 'Sisters of EVE',
      lpCost: 400_000,
      lpIskCost: 850_000,
      lpAffordable: true,
      ...overrides,
    };
  }

  it('is true when the LP option is affordable and cheaper', () => {
    expect(lpBeatsMarket(row())).toBe(true);
  });

  it('is false when the LP option is affordable but not cheaper', () => {
    expect(lpBeatsMarket(row({ lpIskCost: 200_000_000 }))).toBe(false);
  });

  it('is false when the LP option is cheaper but unaffordable', () => {
    expect(lpBeatsMarket(row({ lpAffordable: false }))).toBe(false);
  });

  it('is true against an unpriced market side, when affordable', () => {
    expect(lpBeatsMarket(row({ sellTotal: null }))).toBe(true);
  });

  it('makes no claim on a row with no LP option at all', () => {
    expect(
      lpBeatsMarket(
        row({
          lpCorpName: undefined,
          lpCost: undefined,
          lpIskCost: undefined,
          lpAffordable: undefined,
        })
      )
    ).toBe(false);
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
        modifiers: NO_CHARACTER_MODIFIERS,
        materialPrices: {},
      })
    ).toBeUndefined();
  });

  it('refines the pasted quantity at the station base rate with no skills trained', () => {
    const refine = computeAppraisalRefine({
      quantity: 1000,
      reprocessing: veldspar,
      modifiers: NO_CHARACTER_MODIFIERS,
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
      modifiers: NO_CHARACTER_MODIFIERS,
      materialPrices: { 34: 5 },
    });
    expect(refine).toEqual({ valueAtFullPrice: 0, pricedAll: true, unitsLeftOver: 50 });
  });

  it('flags an unpriced output material rather than pricing it as free', () => {
    const refine = computeAppraisalRefine({
      quantity: 1000,
      reprocessing: veldspar,
      modifiers: NO_CHARACTER_MODIFIERS,
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

describe('refineBeatsSellAsIs (issue #1048)', () => {
  /** A priced row carrying a refine comparison; overrides say what the case is. */
  function row(overrides: Partial<AppraisalRow> = {}): AppraisalRow {
    return {
      typeId: 1,
      name: 'Mercoxit III-Grade',
      quantity: 100,
      buyEach: 16_000,
      sellEach: 17_000,
      buyTotal: 1_600_000,
      sellTotal: 1_700_000,
      refineTotal: 1_700_000,
      refinePricedAll: true,
      refineUnitsLeftOver: 0,
      ...overrides,
    };
  }

  it('compares the two totals directly when the quantity is whole batches', () => {
    expect(refineBeatsSellAsIs(row())).toBe(true);
    expect(refineBeatsSellAsIs(row({ refineTotal: 1_500_000 }))).toBe(false);
  });

  it('values the leftover units the refine path still holds, at the sell-as-is price', () => {
    // The worked example from issue #1048, at live Jita prices: 999 Mercoxit
    // III-Grade refines 900 units for 15,436,890 and leaves 99 to sell at
    // 16,000 each, beating 15,984,000 sold as-is by 1,036,890 ISK. Comparing
    // the refine total alone against the full quantity would have called this
    // for selling and cost the player that difference.
    const paste = row({
      quantity: 999,
      buyTotal: 15_984_000,
      refineTotal: 15_436_890,
      refineUnitsLeftOver: 99,
    });
    expect(refineBeatsSellAsIs(paste)).toBe(true);
  });

  it('still calls a genuine loss for selling, leftover included', () => {
    const paste = row({
      quantity: 999,
      buyTotal: 15_984_000,
      refineTotal: 14_000_000,
      refineUnitsLeftOver: 99,
    });
    expect(refineBeatsSellAsIs(paste)).toBe(false);
  });

  it('does not call a tie for refining: below one batch, both paths are the same goods', () => {
    // Nothing refines, so the leftover is the whole paste and the two sides
    // are exactly equal. A tie is not a win.
    const partBatch = row({
      quantity: 99,
      buyTotal: 1_584_000,
      refineTotal: 0,
      refineUnitsLeftOver: 99,
    });
    expect(refineBeatsSellAsIs(partBatch)).toBe(false);
  });

  it('makes no claim on a row with no reprocessing data', () => {
    expect(
      refineBeatsSellAsIs(
        row({ refineTotal: undefined, refinePricedAll: undefined, refineUnitsLeftOver: undefined })
      )
    ).toBe(false);
  });

  it('makes no claim when nobody is buying, rather than valuing the leftover at zero', () => {
    const unpriced = row({
      quantity: 999,
      buyEach: null,
      buyTotal: null,
      refineTotal: 15_436_890,
      refineUnitsLeftOver: 99,
    });
    expect(refineBeatsSellAsIs(unpriced)).toBe(false);
  });
});
