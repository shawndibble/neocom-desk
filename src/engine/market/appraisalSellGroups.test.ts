import { describe, expect, it } from 'vitest';
import { buildAppraisal, type AppraisalItem } from './appraisal';
import { appraisalSellGroups } from './appraisalSellGroups';

function item(overrides: Partial<AppraisalItem> & { typeId: number }): AppraisalItem {
  return { name: `Item ${overrides.typeId}`, quantity: 10, buy: 100, sell: 200, ...overrides };
}

function groups(items: AppraisalItem[]) {
  const g = appraisalSellGroups(buildAppraisal(items, 100));
  return {
    sellNow: g.sellNow.map((i) => i.typeId),
    list: g.list.map((i) => i.typeId),
    refine: g.refine.map((i) => i.typeId),
  };
}

describe('appraisalSellGroups', () => {
  it('lists an item whose undercut price beats the best buy order', () => {
    expect(groups([item({ typeId: 1 })])).toEqual({ sellNow: [], list: [1], refine: [] });
  });

  it('sells now when the undercut price is no better than the best buy order', () => {
    // undercut of 101 sits one tick under sell; buy 150 pays more, with no broker fee
    expect(groups([item({ typeId: 1, buy: 150, sell: 101 })])).toEqual({
      sellNow: [1],
      list: [],
      refine: [],
    });
  });

  it('sells now when nobody is selling, so there is nothing to undercut', () => {
    expect(groups([item({ typeId: 1, sell: null })]).sellNow).toEqual([1]);
  });

  it('leaves out an item with neither a buy order nor a legal undercut', () => {
    expect(groups([item({ typeId: 1, buy: null, sell: null })])).toEqual({
      sellNow: [],
      list: [],
      refine: [],
    });
  });

  it('lists an item nobody is buying, since listing needs no buyer', () => {
    expect(groups([item({ typeId: 1, buy: null })]).list).toEqual([1]);
  });

  it('refines an item when refining beats selling it as is, and not twice', () => {
    const refinable = item({
      typeId: 1,
      refine: { valueAtFullPrice: 5000, pricedAll: true, unitsLeftOver: 0 },
    });
    expect(groups([refinable])).toEqual({ sellNow: [], list: [], refine: [1] });
  });

  it('sells a refinable item that refining does not beat', () => {
    const notWorth = item({
      typeId: 1,
      refine: { valueAtFullPrice: 10, pricedAll: true, unitsLeftOver: 0 },
    });
    expect(groups([notWorth]).list).toEqual([1]);
  });

  it('keeps each group in the pasted order and puts every item in at most one', () => {
    const g = groups([item({ typeId: 3 }), item({ typeId: 2, sell: null }), item({ typeId: 1 })]);
    expect(g).toEqual({ sellNow: [2], list: [3, 1], refine: [] });
  });
});
