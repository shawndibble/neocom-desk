import { describe, expect, it } from 'vitest';
import { buildAppraisal, refineBeatsSellAsIs, type AppraisalItem } from '@/engine/market/appraisal';
import {
  buildRefineBreakdown,
  buildRefineComparison,
  lopsidedItems,
  refineEfficiencyRange,
} from '@/engine/market/refineBreakdown';

const PYERITE = 35;
const MEXALLON = 36;

/** A 100-portion ore returning 16,000 Pyerite and 800 Mexallon per portion. */
function ore(
  overrides: Partial<AppraisalItem> & { efficiency?: number; quantity?: number }
): AppraisalItem {
  const { efficiency = 0.5, quantity = 1000, ...rest } = overrides;
  const batches = Math.floor(quantity / 100);
  const pyerite = Math.floor(16_000 * batches * efficiency);
  const mexallon = Math.floor(800 * batches * efficiency);
  return {
    typeId: 1,
    name: 'Zeolites',
    quantity,
    buy: 1000,
    sell: 1200,
    refine: {
      valueAtFullPrice: pyerite * 10 + mexallon * 50,
      pricedAll: true,
      unitsLeftOver: quantity - batches * 100,
      detail: {
        portionSize: 100,
        materials: [
          { typeId: PYERITE, quantity: 16_000 },
          { typeId: MEXALLON, quantity: 800 },
        ],
        efficiency,
        materialPrices: { [PYERITE]: 10, [MEXALLON]: 50 },
      },
    },
    ...rest,
  };
}

describe('buildRefineBreakdown', () => {
  it('sums the minerals every refined item returns, floored per item as the game does', () => {
    const items = [
      ore({ typeId: 1, quantity: 1000 }),
      ore({ typeId: 2, name: 'B', quantity: 250 }),
    ];
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal(items, 100),
      pricePercent: 100,
      taxRate: 0,
    });
    const pyerite = breakdown.minerals.find((m) => m.typeId === PYERITE);
    // 10 batches and 2 batches, each floored on its own.
    expect(pyerite?.quantity).toBe(Math.floor(16_000 * 10 * 0.5) + Math.floor(16_000 * 2 * 0.5));
    expect(breakdown.minerals.map((m) => m.typeId)).toEqual([PYERITE, MEXALLON]);
  });

  it('agrees with the row refine total the table shows', () => {
    const items = [ore({ quantity: 1000 })];
    const appraisal = buildAppraisal(items, 90);
    const breakdown = buildRefineBreakdown({ appraisal, pricePercent: 90, taxRate: 0 });
    expect(breakdown.items[0].refined).toBeCloseTo(appraisal.rows[0].refineTotal ?? NaN, 6);
  });

  it('adds the leftover units at the row buy price and keeps them out of the minerals', () => {
    const items = [ore({ quantity: 1038 })];
    const appraisal = buildAppraisal(items, 90);
    const breakdown = buildRefineBreakdown({ appraisal, pricePercent: 90, taxRate: 0 });
    expect(breakdown.unitsLeftOver).toBe(38);
    expect(breakdown.leftoverValue).toBeCloseTo(38 * 900, 6);
    expect(breakdown.total).toBeCloseTo(breakdown.mineralValue + 38 * 900, 6);
    // `net` is what the table's Refine column and the chip sum to: minerals only, no leftover.
    expect(breakdown.net).toBeCloseTo(appraisal.totals.refine, 6);
  });

  it('takes the tax off the mineral value only and reports it', () => {
    const items = [ore({ quantity: 1000 })];
    const appraisal = buildAppraisal(items, 100);
    const taxed = buildRefineBreakdown({ appraisal, pricePercent: 100, taxRate: 0.1 });
    const free = buildRefineBreakdown({ appraisal, pricePercent: 100, taxRate: 0 });
    expect(taxed.tax).toBeCloseTo(free.mineralValue * 0.1, 6);
    expect(taxed.total).toBeCloseTo(free.total * 0.9, 6);
  });

  it('says refine wins only when it beats selling as is to buy orders', () => {
    // 1,000 units at 1,000 ISK is 1,000,000 ISK as is.
    // 50% efficiency refines into 80,000 x 10 + 4,000 x 50 = 1,000,000 ISK: a tie is not a win.
    const tie = buildRefineBreakdown({
      appraisal: buildAppraisal([ore({ quantity: 1000 })], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(tie.asIs).toBe(1_000_000);
    expect(tie.total).toBe(1_000_000);
    expect(tie.refineWins).toBe(false);

    const better = buildRefineBreakdown({
      appraisal: buildAppraisal([ore({ quantity: 1000, efficiency: 0.9 })], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(better.refineWins).toBe(true);
    expect(better.difference).toBeGreaterThan(0);
  });

  it('finds the efficiency where refining stops beating selling as is', () => {
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal([ore({ quantity: 100_000, efficiency: 0.9 })], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    // As is is 100M; refining yields (16,000 x 10 + 800 x 50) = 200,000 per batch at 100%:
    // 1,000 batches x 200,000 x e = 100M at e = 0.5.
    expect(breakdown.breakEvenEfficiency).toBeCloseTo(0.5, 2);
  });

  it('has no break-even when refining never wins, however good the yield', () => {
    const items = [ore({ buy: 10_000_000, quantity: 1000 })];
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal(items, 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(breakdown.breakEvenEfficiency).toBeNull();
  });

  it('reports the span of efficiencies when the items differ', () => {
    const items = [
      ore({ typeId: 1, efficiency: 0.68 }),
      ore({ typeId: 2, name: 'B', efficiency: 0.7 }),
    ];
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal(items, 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(breakdown.efficiencyMin).toBe(0.68);
    expect(breakdown.efficiencyMax).toBe(0.7);
  });

  it('flags an unpriced mineral as a floor rather than counting it free', () => {
    const item = ore({ quantity: 1000 });
    const detail = item.refine?.detail;
    if (!item.refine || !detail) throw new Error('fixture');
    item.refine = {
      ...item.refine,
      pricedAll: false,
      detail: { ...detail, materialPrices: { [PYERITE]: 10 } },
    };
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal([item], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(breakdown.pricedAll).toBe(false);
    expect(breakdown.minerals.find((m) => m.typeId === MEXALLON)?.price).toBeNull();
  });

  it('counts items with no refine data as skipped and leaves them out of every figure', () => {
    const plain: AppraisalItem = { typeId: 9, name: 'Hull', quantity: 1, buy: 5, sell: 6 };
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal([ore({ quantity: 1000 }), plain], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(breakdown.skipped).toBe(1);
    expect(breakdown.items).toHaveLength(1);
    expect(breakdown.asIs).toBe(1_000_000);
  });

  it('narrows to the chosen items for a one-row breakdown', () => {
    const items = [ore({ typeId: 1 }), ore({ typeId: 2, name: 'B', quantity: 500 })];
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal(items, 100),
      pricePercent: 100,
      taxRate: 0,
      onlyTypeId: 2,
    });
    expect(breakdown.items.map((item) => item.typeId)).toEqual([2]);
    expect(breakdown.asIs).toBe(500_000);
  });

  it('counts an item nobody buys as is, and never claims a break-even against nothing', () => {
    const breakdown = buildRefineBreakdown({
      appraisal: buildAppraisal([ore({ buy: null, quantity: 1000 })], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(breakdown.unbuyable).toBe(1);
    expect(breakdown.asIs).toBe(0);
    expect(breakdown.breakEvenEfficiency).toBeNull();
  });

  it('has no breakdown when nothing carries refine detail', () => {
    const plain: AppraisalItem = { typeId: 9, name: 'Hull', quantity: 1, buy: 5, sell: 6 };
    expect(
      buildRefineBreakdown({
        appraisal: buildAppraisal([plain], 100),
        pricePercent: 100,
        taxRate: 0,
      }).items
    ).toEqual([]);
  });
});

describe('refineEfficiencyRange', () => {
  it('spans the efficiencies of the items that refine, and is null with none', () => {
    const plain: AppraisalItem = { typeId: 9, name: 'Hull', quantity: 1, buy: 5, sell: 6 };
    expect(
      refineEfficiencyRange([ore({ efficiency: 0.68 }), ore({ efficiency: 0.7 }), plain])
    ).toEqual({
      min: 0.68,
      max: 0.7,
    });
    expect(refineEfficiencyRange([plain])).toBeNull();
  });
});

describe('refine on each price basis', () => {
  /** Minerals sell for 8 and 70 where they buy for 10 and 50; the ore buys for 1,000 and sells for 1,500. */
  function withSell(item: AppraisalItem): AppraisalItem {
    const refine = item.refine;
    const detail = refine?.detail;
    if (!refine || !detail) throw new Error('fixture');
    return {
      ...item,
      sell: 1500,
      refine: {
        ...refine,
        detail: { ...detail, materialSellPrices: { [PYERITE]: 8, [MEXALLON]: 70 } },
      },
    };
  }
  const build = (item: AppraisalItem, basis: 'buy' | 'split' | 'sell') =>
    buildRefineBreakdown({
      appraisal: buildAppraisal([item], 100),
      pricePercent: 100,
      taxRate: 0,
      basis,
    });

  it('prices the minerals and the as-is pile on the chosen side', () => {
    const item = withSell(ore({ quantity: 1000, efficiency: 0.9 }));
    // 10 portions at 0.9: 144,000 Pyerite and 7,200 Mexallon.
    const buy = build(item, 'buy');
    expect(buy.asIs).toBe(1_000_000);
    expect(buy.mineralValue).toBe(144_000 * 10 + 7_200 * 50);
    const sell = build(item, 'sell');
    expect(sell.asIs).toBe(1_500_000);
    expect(sell.mineralValue).toBe(144_000 * 8 + 7_200 * 70);
    const split = build(item, 'split');
    expect(split.asIs).toBe(1_250_000);
    expect(split.mineralValue).toBeCloseTo(144_000 * 9 + 7_200 * 60, 6);
  });

  it('lists both unit prices on every mineral line, whatever the basis', () => {
    const item = withSell(ore({ quantity: 1000, efficiency: 0.9 }));
    const pyerite = build(item, 'buy').minerals.find((m) => m.typeId === PYERITE);
    expect(pyerite).toMatchObject({ buyPrice: 10, sellPrice: 8, price: 10 });
    expect(build(item, 'sell').minerals.find((m) => m.typeId === PYERITE)?.price).toBe(8);
  });

  it('judges the verdict on the basis it prices', () => {
    const item = withSell(ore({ quantity: 1000, efficiency: 0.9 }));
    // Buy: 1,800,000 refined against 1,000,000 as is. Sell: 1,656,000 against 1,500,000.
    expect(build(item, 'buy').refineWins).toBe(true);
    expect(build(item, 'sell').refineWins).toBe(true);
    const poor = withSell(ore({ quantity: 1000, efficiency: 0.5 }));
    expect(build(poor, 'sell').refineWins).toBe(false);
  });

  it('compares all three bases at once, and has no sell or split where the sell prices were never read', () => {
    const full = buildRefineComparison({
      appraisal: buildAppraisal([withSell(ore({ quantity: 1000, efficiency: 0.9 }))], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(full.buy?.asIs).toBe(1_000_000);
    expect(full.split?.asIs).toBe(1_250_000);
    expect(full.sell?.asIs).toBe(1_500_000);

    const old = buildRefineComparison({
      appraisal: buildAppraisal([ore({ quantity: 1000, efficiency: 0.9 })], 100),
      pricePercent: 100,
      taxRate: 0,
    });
    expect(old.buy).not.toBeNull();
    expect(old.split).toBeNull();
    expect(old.sell).toBeNull();
  });
});

describe('Janice parity', () => {
  // The six ores of the Jita appraisal the breakdown was checked against, at 100%, with the buy and sell
  // prices Janice quoted in the same minute and the 0.6831 reprocessing yield. Its Buy, Split and Sell
  // totals, as is and refined with leftover, are the figures below to the cent.
  const BIT = [
    { typeId: 35, quantity: 6000 },
    { typeId: 36, quantity: 400 },
    { typeId: 16633, quantity: 65 },
  ];
  const BRIM = [
    { typeId: 35, quantity: 6900 },
    { typeId: 36, quantity: 460 },
    { typeId: 16633, quantity: 75 },
  ];
  const COES = [
    { typeId: 35, quantity: 4000 },
    { typeId: 36, quantity: 800 },
    { typeId: 16636, quantity: 130 },
  ];
  const ZEO = [
    { typeId: 35, quantity: 16000 },
    { typeId: 36, quantity: 800 },
    { typeId: 16634, quantity: 130 },
  ];
  const buyPrices = { 35: 16.68, 36: 50.61, 16633: 380.8, 16636: 355.5, 16634: 180 };
  const sellPrices = { 35: 17.05, 36: 52.34, 16633: 420, 16636: 413.1, 16634: 188.6 };
  const item = (
    typeId: number,
    name: string,
    quantity: number,
    buy: number,
    sell: number,
    materials: { typeId: number; quantity: number }[]
  ): AppraisalItem => ({
    typeId,
    name,
    quantity,
    buy,
    sell,
    refine: {
      valueAtFullPrice: 0,
      pricedAll: true,
      unitsLeftOver: quantity % 100,
      detail: {
        portionSize: 100,
        materials,
        efficiency: 0.6831,
        materialPrices: buyPrices,
        materialSellPrices: sellPrices,
      },
    },
  });
  const items = [
    item(62454, 'Compressed Bitumens', 186, 1279, 1280, BIT),
    item(62455, 'Compressed Brimful Bitumens', 632, 1412, 1413, BRIM),
    item(62459, 'Compressed Glistening Coesite', 1737, 1241, 1242, COES),
    item(62467, 'Compressed Glistening Zeolites', 57_638, 2812, 2813, ZEO),
    item(46287, 'Glistening Coesite', 164, 260.1, 5000, COES),
    item(46281, 'Glistening Zeolites', 2471, 1110, 51_100, ZEO),
  ];
  const comparison = buildRefineComparison({
    appraisal: buildAppraisal(items, 100),
    pricePercent: 100,
    taxRate: 0,
  });

  it('reproduces every mineral quantity', () => {
    const quantity = (id: number) => comparison.buy.minerals.find((m) => m.typeId === id)?.quantity;
    expect([35, 36, 16633, 16636, 16634].map(quantity)).toEqual([
      6_639_319, 339_881, 351, 1_597, 53_281,
    ]);
  });

  it('reproduces the as-is and refined totals on the buy, split and sell bases', () => {
    const figures = (basis: 'buy' | 'split' | 'sell') => {
      const breakdown = comparison[basis];
      return [breakdown?.asIs ?? NaN, breakdown?.total ?? NaN];
    };
    const [buyAsIs, buyRefined] = figures('buy');
    expect(buyAsIs).toBeCloseTo(168_149_417.4, 1);
    expect(buyRefined).toBeCloseTo(138_640_600.03, 1);
    const [splitAsIs, splitRefined] = figures('split');
    expect(splitAsIs).toBeCloseTo(230_330_830.7, 1);
    expect(splitRefined).toBeCloseTo(142_371_270.91, 1);
    const [sellAsIs, sellRefined] = figures('sell');
    expect(sellAsIs).toBeCloseTo(292_512_244, 1);
    expect(sellRefined).toBeCloseTo(146_101_941.79, 1);
  });

  it('finds the 82.89% break-even on the buy side, and none up to 100% on the others', () => {
    expect(comparison.buy.breakEvenEfficiency).toBeCloseTo(0.8289, 3);
    expect(comparison.split?.breakEvenEfficiency ?? 0).toBeGreaterThan(1);
    expect(comparison.sell?.breakEvenEfficiency ?? 0).toBeGreaterThan(1);
  });

  it('calls the two ores that sell for over 10 times their buy price lopsided', () => {
    expect(lopsidedItems(items).map((i) => i.name)).toEqual([
      'Glistening Coesite',
      'Glistening Zeolites',
    ]);
    expect(lopsidedItems(items, 62467)).toEqual([]);
  });
});

describe('a basis with no as-is price is no comparison, as in the table', () => {
  it('is not a win on that basis, and the table agrees', () => {
    const item: AppraisalItem = { ...ore({ quantity: 1000, efficiency: 0.9 }), sell: null };
    const detail = item.refine?.detail;
    if (!item.refine || !detail) throw new Error('fixture');
    item.refine = {
      ...item.refine,
      detail: { ...detail, materialSellPrices: { [PYERITE]: 8, [MEXALLON]: 70 } },
    };
    const appraisal = buildAppraisal([item], 100);
    const sell = buildRefineBreakdown({ appraisal, pricePercent: 100, taxRate: 0, basis: 'sell' });
    expect(sell.items[0].wins).toBe(false);
    expect(refineBeatsSellAsIs(appraisal.rows[0], 'sell')).toBe(false);
    expect(sell.unbuyable).toBe(1);
  });
});
