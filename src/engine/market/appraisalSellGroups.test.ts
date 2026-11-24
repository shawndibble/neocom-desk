import { describe, expect, it } from 'vitest';
import { buildAppraisal, type AppraisalItem } from './appraisal';
import {
  appraisalRowTurnIn,
  appraisalSellGroups,
  type AppraisalTurnInLookup,
} from './appraisalSellGroups';
import type { TurnInOffer } from './turnIn';

function item(overrides: Partial<AppraisalItem> & { typeId: number }): AppraisalItem {
  return { name: `Item ${overrides.typeId}`, quantity: 10, buy: 100, sell: 200, ...overrides };
}

function groups(items: AppraisalItem[], turnIn?: AppraisalTurnInLookup) {
  const g = appraisalSellGroups(buildAppraisal(items, 100), 'buy', turnIn);
  return {
    sellNow: g.sellNow.map((i) => i.typeId),
    list: g.list.map((i) => i.typeId),
    refine: g.refine.map((i) => i.typeId),
    turnIn: g.turnIn.map((i) => i.typeId),
  };
}

/** 60 ISK each turned in, no LP; type 1's offer unless told otherwise. */
function offer(overrides: Partial<TurnInOffer> = {}): TurnInOffer {
  return {
    objectiveId: 'obj-1',
    campaignId: 'camp-1',
    typeId: 1,
    iskPerItem: 60,
    iskPerInterval: 60,
    iskInterval: 1,
    lpPerItem: 0,
    lpPerBlock: 0,
    lpBlockSize: null,
    lpCorporationId: null,
    lpValue: null,
    lpIskPerItem: null,
    totalPerItem: 60,
    traderTypeId: 900,
    traderName: 'Secure Strength Trader',
    systemId: 30045324,
    progress: 0,
    targetProgress: 1_000_000,
    filled: 0,
    remaining: 1_000_000,
    maxPerParticipant: null,
    ...overrides,
  };
}

function lookup(
  offers: TurnInOffer[],
  contributed?: Record<string, number>
): AppraisalTurnInLookup {
  return {
    offerFor: (typeId) => offers.find((o) => o.typeId === typeId) ?? null,
    contributedTo: contributed ? (objectiveId) => contributed[objectiveId] ?? null : undefined,
  };
}

describe('appraisalSellGroups', () => {
  it('turns in an item whose Turn-in Reward beats selling it now', () => {
    // 10 × 60 turned in against 10 × 50 into the buy orders
    expect(groups([item({ typeId: 1, buy: 50 })], lookup([offer()]))).toEqual({
      sellNow: [],
      list: [],
      refine: [],
      turnIn: [1],
    });
  });

  it('sells an item whose Turn-in Reward does not beat Sell now', () => {
    const g = groups([item({ typeId: 1, buy: 60, sell: 70 })], lookup([offer()]));
    expect(g.turnIn).toEqual([]);
    expect(g.list).toEqual([1]);
  });

  it('turns in an item nobody is buying, and leaves items without an offer alone', () => {
    const g = groups(
      [item({ typeId: 1, buy: null, sell: null }), item({ typeId: 2 })],
      lookup([offer()])
    );
    expect(g).toEqual({ sellNow: [], list: [2], refine: [], turnIn: [1] });
  });

  it('puts an item in no turn-in group without turn-in data', () => {
    expect(groups([item({ typeId: 1, buy: 50 })]).turnIn).toEqual([]);
  });

  it('keeps a refine win over a smaller Turn-in Reward, and turns in over a smaller refine', () => {
    const refinable = item({
      typeId: 1,
      buy: 10,
      refine: { valueAtFullPrice: 5000, pricedAll: true, unitsLeftOver: 0 },
    });
    expect(groups([refinable], lookup([offer()])).refine).toEqual([1]);
    expect(groups([refinable], lookup([offer({ iskPerInterval: 600 })])).turnIn).toEqual([1]);
  });

  it('lists every item in exactly one group', () => {
    const g = groups(
      [item({ typeId: 1, buy: 50 }), item({ typeId: 2 }), item({ typeId: 3, sell: null })],
      lookup([offer()])
    );
    expect(g).toEqual({ sellNow: [3], list: [2], refine: [], turnIn: [1] });
  });

  it('lists an item whose undercut price beats the best buy order', () => {
    expect(groups([item({ typeId: 1 })])).toEqual({
      sellNow: [],
      list: [1],
      refine: [],
      turnIn: [],
    });
  });

  it('sells now when the undercut price is no better than the best buy order', () => {
    // undercut of 101 sits one tick under sell; buy 150 pays more, with no broker fee
    expect(groups([item({ typeId: 1, buy: 150, sell: 101 })])).toEqual({
      sellNow: [1],
      list: [],
      refine: [],
      turnIn: [],
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
      turnIn: [],
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
    expect(groups([refinable])).toEqual({ sellNow: [], list: [], refine: [1], turnIn: [] });
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
    expect(g).toEqual({ sellNow: [2], list: [3, 1], refine: [], turnIn: [] });
  });
});

describe('appraisalRowTurnIn', () => {
  const rowOf = (i: AppraisalItem) => buildAppraisal([i], 100).rows[0]!;

  it('prices the pile turned in against Sell now for the same units', () => {
    const turnIn = appraisalRowTurnIn(
      rowOf(item({ typeId: 1, buy: 50 })),
      'buy',
      lookup([offer()])
    );
    expect(turnIn).toMatchObject({ sellNow: 500, over: 100, beats: true });
    expect(turnIn?.reward.total).toBe(600);
  });

  it('is null for an item with no Active offer, or one the objective takes no more of', () => {
    expect(appraisalRowTurnIn(rowOf(item({ typeId: 2 })), 'buy', lookup([offer()]))).toBeNull();
    expect(
      appraisalRowTurnIn(rowOf(item({ typeId: 1 })), 'buy', lookup([offer({ remaining: 0 })]))
    ).toBeNull();
  });

  it("counts only what the Character's cap still takes, and compares Sell now for those units", () => {
    const turnIn = appraisalRowTurnIn(
      rowOf(item({ typeId: 1, buy: 50 })),
      'buy',
      lookup([offer({ maxPerParticipant: 10 })], { 'obj-1': 6 })
    );
    expect(turnIn?.reward.quantity).toBe(4);
    expect(turnIn).toMatchObject({ sellNow: 200, over: 40, beats: true });
  });

  it('does not beat selling on a tie', () => {
    expect(
      appraisalRowTurnIn(rowOf(item({ typeId: 1, buy: 60 })), 'buy', lookup([offer()]))?.beats
    ).toBe(false);
  });
});
