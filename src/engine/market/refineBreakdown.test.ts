import { describe, expect, it } from 'vitest';
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';
import { buildRefineBreakdown, refineEfficiencyRange } from '@/engine/market/refineBreakdown';

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
