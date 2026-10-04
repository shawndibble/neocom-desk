import { describe, expect, it } from 'vitest';
import { filterHaulingRows, formatDaysToSell, toViewRows } from './haulingView';
import type { HaulingScanRow, InstantHaulingScanRow, ListHaulingScanRow } from './haulingData';
import { TRADE_HUBS } from '@/market/hubs';

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};
const FEES_AT = () => FEES;
const JITA = TRADE_HUBS[0]!;
const AMARR = TRADE_HUBS[1]!;

function scanRow(
  over: Partial<ListHaulingScanRow> & { typeId: number },
  sale: Partial<ListHaulingScanRow['sale']> = {}
): ListHaulingScanRow {
  return {
    mode: 'list',
    fromHub: JITA,
    toHub: AMARR,
    destBuyLadder: [],
    name: `Item ${over.typeId}`,
    groupId: null,
    categoryId: null,
    unitVolumeM3: 1,
    buyLadder: [{ price: 100, units: 10_000, orders: 3 }],
    destLadder: [{ price: 200, units: 50, orders: 3 }],
    demand: { dailyVolume: 10, daysWithTrades: 25, recentSalePrice: 150, demand: 'most-days' },
    sale: {
      price: 150,
      lowestAsk: 200,
      undercutPrice: 199,
      recentSalePrice: 150,
      unitsAhead: 0,
      dailyVolume: 10,
      daysToSell: 1,
      demandCapUnits: 70,
      ...sale,
    },
    ...over,
  } as ListHaulingScanRow;
}

function instantRow(over: Partial<InstantHaulingScanRow> & { typeId: number }): HaulingScanRow {
  return {
    mode: 'instant',
    fromHub: JITA,
    toHub: AMARR,
    name: `Item ${over.typeId}`,
    groupId: null,
    categoryId: null,
    unitVolumeM3: 2,
    buyLadder: [
      { price: 100, units: 10, orders: 1 },
      { price: 105, units: 20, orders: 2 },
    ],
    destLadder: [{ price: 200, units: 50, orders: 3 }],
    destBuyLadder: [
      { price: 115, units: 5, orders: 1 },
      { price: 110, units: 12, orders: 2 },
      { price: 108, units: 100, orders: 3 },
    ],
    ...over,
  };
}

describe('toViewRows', () => {
  it('reports the margin after fees on the suggested load, and its flags', () => {
    const [row] = toViewRows([scanRow({ typeId: 1 })], FEES_AT);
    // 70 units: cost 7,000, revenue 10,500, tax 3.375% + broker 1.8% of revenue.
    const revenue = 70 * 150;
    const profit = revenue - revenue * 0.03375 - revenue * 0.018 - 7000;
    expect(row!.marginPct).toBeCloseTo((profit / 7000) * 100);
    expect(row!.profitPerUnit).toBeCloseTo(profit / 70);
    expect(row!.flags).toEqual([]);
  });

  it("prices each row at its own destination hub's fees", () => {
    const good = { ...FEES, standing: { factionStanding: 10, corpStanding: 10 } };
    const feesAt = (hub: { id: string }) => (hub.id === 'rens' ? good : FEES);
    const [home, away] = toViewRows(
      [scanRow({ typeId: 1 }), scanRow({ typeId: 2, toHub: TRADE_HUBS[3]! })],
      feesAt
    );
    expect(home!.fees).toBe(FEES);
    expect(away!.fees).toBe(good);
    expect(away!.candidate.fees).toBe(good);
    expect(away!.marginPct).toBeGreaterThan(home!.marginPct);
  });

  it('carries a low-margin flag when the margin is under the floor', () => {
    const [row] = toViewRows([scanRow({ typeId: 1 }, { price: 103 })], FEES_AT);
    expect(row!.flags).toContain('low-margin');
  });
});

describe('filterHaulingRows', () => {
  const rows = toViewRows(
    [
      scanRow({ typeId: 1 }, { daysToSell: 3 }),
      scanRow({ typeId: 2 }, { daysToSell: 30 }),
      scanRow({ typeId: 3 }, { price: 102, daysToSell: 2 }),
    ],
    FEES_AT
  );

  it('hides the slow and the thin-margin, and counts each', () => {
    const { shown, hidden } = filterHaulingRows(rows, {
      maxDays: 14,
      minMarginPct: 3,
      steadyOnly: false,
    });
    expect(shown.map((r) => r.typeId)).toEqual([1]);
    expect(hidden).toEqual({ thin: 0, slow: 1, lowMargin: 1 });
  });

  it('shows everything when the days limit is off and the margin floor is zero', () => {
    const { shown, hidden } = filterHaulingRows(rows, {
      maxDays: null,
      minMarginPct: -100,
      steadyOnly: false,
    });
    expect(shown).toHaveLength(3);
    expect(hidden).toEqual({ thin: 0, slow: 0, lowMargin: 0 });
  });

  it('sorts best margin first', () => {
    const { shown } = filterHaulingRows(rows, {
      maxDays: null,
      minMarginPct: -100,
      steadyOnly: false,
    });
    const margins = shown.map((r) => r.marginPct);
    expect(margins).toEqual([...margins].sort((a, b) => b - a));
  });

  it('hides rarely-selling rows when asked for steady demand only', () => {
    const thin = scanRow({ typeId: 9 });
    thin.demand = { ...thin.demand, demand: 'rarely' };
    const all = toViewRows([scanRow({ typeId: 1 }), thin], FEES_AT);
    const { shown, hidden } = filterHaulingRows(all, {
      maxDays: null,
      minMarginPct: -100,
      steadyOnly: true,
    });
    expect(shown.map((r) => r.typeId)).toEqual([1]);
    expect(hidden.thin).toBe(1);
  });
});

describe('suggested units', () => {
  it('stops at what is profitable to buy, the same cap the plan applies', () => {
    const [row] = toViewRows(
      [
        scanRow({
          typeId: 1,
          buyLadder: [
            { price: 100, units: 10, orders: 1 },
            { price: 900, units: 500, orders: 1 }, // dearer than the 150 it would sell for
          ],
        }),
      ],
      FEES_AT
    );
    expect(row!.suggestedUnits).toBe(10);
    expect(row!.candidate.demandCapUnits).toBe(70);
  });
});

describe('ISK/m³', () => {
  it('is the profit per unit over the unit volume, in both modes', () => {
    const [listed] = toViewRows([scanRow({ typeId: 1, unitVolumeM3: 4 })], FEES_AT);
    expect(listed!.iskPerM3).toBeCloseTo(listed!.profitPerUnit / 4);
    const [instant] = toViewRows([instantRow({ typeId: 2 })], FEES_AT);
    expect(instant!.iskPerM3).toBeCloseTo(instant!.profitPerUnit / 2);
  });
});

describe('selling into buy orders', () => {
  it('works the load to the profitable depth of both books, after sales tax only', () => {
    const [row] = toViewRows([instantRow({ typeId: 1 })], FEES_AT);
    // The walkInstant worked example: 17 units, 1,735 ISK in, 1,895 ISK out.
    const profit = 1895 - 1895 * 0.03375 - 1735;
    expect(row!.suggestedUnits).toBe(17);
    expect(row!.marginPct).toBeCloseTo((profit / 1735) * 100);
    expect(row!.profitPerUnit).toBeCloseTo(profit / 17);
    expect(row!.candidate.demandCapUnits).toBeNull();
  });

  it('shows the realised buy-order price, not an Expected Sell Price', () => {
    const [row] = toViewRows([instantRow({ typeId: 1 })], FEES_AT);
    expect(row!.price).toBeCloseTo(1895 / 17);
    const [listed] = toViewRows([scanRow({ typeId: 2 })], FEES_AT);
    expect(listed!.price).toBe(150);
  });

  it('never hides an instant row as thin or slow, only on margin', () => {
    const rows = toViewRows(
      [instantRow({ typeId: 1 }), instantRow({ typeId: 2, destBuyLadder: [] })],
      FEES_AT
    );
    const { shown, hidden } = filterHaulingRows(rows, {
      maxDays: 1,
      minMarginPct: 3,
      steadyOnly: true,
    });
    expect(shown.map((r) => r.typeId)).toEqual([1]);
    expect(hidden).toEqual({ thin: 0, slow: 0, lowMargin: 1 });
  });
});

describe('formatDaysToSell', () => {
  it('is whole days, at least one, and capped', () => {
    expect(formatDaysToSell(0.2)).toBe('1');
    expect(formatDaysToSell(6.6)).toBe('7');
    expect(formatDaysToSell(400)).toBe('99+');
  });
});
