import { describe, expect, it } from 'vitest';
import type { RealizedMargin } from '@/engine/market/realizedMargin';
import { rankItemMargins, rollupMarginsByItem } from './transactionItemMargins';

let nextId = 1;
function fill(typeId: number, isBuy: boolean, quantity: number) {
  return { transaction_id: nextId++, type_id: typeId, is_buy: isBuy, quantity };
}
const m = (margin: number): RealizedMargin => ({ unitCost: 1, salesTax: 1, margin });

describe('rollupMarginsByItem', () => {
  it('sums the margins of an item’s sells and counts fills and units sold', () => {
    const buy = fill(1, true, 10);
    const s1 = fill(1, false, 4);
    const s2 = fill(1, false, 6);
    const [row] = rollupMarginsByItem(
      [buy, s1, s2],
      new Map([
        [s1.transaction_id, m(100)],
        [s2.transaction_id, m(-30)],
      ])
    );
    expect(row).toEqual({ typeId: 1, fills: 3, unitsSold: 10, margin: 70 });
  });

  it('gives no margin when any sell of the item is uncovered', () => {
    const s1 = fill(2, false, 4);
    const s2 = fill(2, false, 1);
    const [row] = rollupMarginsByItem([s1, s2], new Map([[s1.transaction_id, m(50)]]));
    expect(row).toEqual({ typeId: 2, fills: 2, unitsSold: 5, margin: null });
  });

  it('gives no margin to an item with only buys', () => {
    const [row] = rollupMarginsByItem([fill(3, true, 5)], new Map());
    expect(row.margin).toBeNull();
    expect(row.unitsSold).toBe(0);
  });
});

describe('rankItemMargins', () => {
  const rows = [
    { typeId: 1, fills: 1, unitsSold: 1, margin: 10 },
    { typeId: 2, fills: 1, unitsSold: 1, margin: null },
    { typeId: 3, fills: 1, unitsSold: 1, margin: 50 },
    { typeId: 4, fills: 1, unitsSold: 1, margin: -5 },
  ];
  it('ranks best first and lists unranked items last', () => {
    expect(rankItemMargins(rows, 'best').map((r) => r.typeId)).toEqual([3, 1, 4, 2]);
  });
  it('ranks worst first and lists unranked items last', () => {
    expect(rankItemMargins(rows, 'worst').map((r) => r.typeId)).toEqual([4, 1, 3, 2]);
  });
});
