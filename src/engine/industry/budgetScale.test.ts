import { describe, it, expect } from 'vitest';
import type { MaterialCostLine } from '@/engine/industry/types';
import { scaleToBudget, HEAVY_LINE_SHARE } from './budgetScale';
import { shoppingListText } from './shoppingList';

function line(typeID: number, remainingQuantity: number, unitPrice: number | null) {
  return {
    typeID,
    baseQuantity: remainingQuantity,
    quantity: remainingQuantity,
    ownedQuantity: 0,
    remainingQuantity,
    unitPrice,
    lineCost: (unitPrice ?? 0) * remainingQuantity,
    unpriced: unitPrice === null,
  } as MaterialCostLine;
}

const total = (lines: readonly MaterialCostLine[]) =>
  lines.reduce((sum, l) => sum + l.remainingQuantity * (l.unitPrice ?? 0), 0);

describe('scaleToBudget', () => {
  const lines = [line(1, 1000, 7), line(2, 333, 13), line(3, 50, 1000)];

  it('never spends more than the budget and keeps whole units', () => {
    const { materials } = scaleToBudget(lines, 5000);
    expect(total(materials)).toBeLessThanOrEqual(5000);
    for (const m of materials) expect(Number.isInteger(m.remainingQuantity)).toBe(true);
  });

  it('gives an empty list for a zero budget', () => {
    const { materials, coverage } = scaleToBudget(lines, 0);
    expect(shoppingListText(materials, String)).toBe('');
    expect(coverage).toBe(0);
  });

  it('changes nothing when the budget covers the need', () => {
    const { materials, coverage } = scaleToBudget(lines, total(lines) + 1);
    expect(materials).toEqual(lines);
    expect(coverage).toBe(1);
  });

  it('reports the share of the full cost the scaled list covers', () => {
    const { coverage } = scaleToBudget([line(1, 100, 10)], 500);
    expect(coverage).toBeCloseTo(0.5);
  });

  it('marks lines costing at least 10% of the budget', () => {
    const { heavy } = scaleToBudget([line(1, 1000, 1), line(2, 1000, 99)], 50_000);
    expect(HEAVY_LINE_SHARE).toBe(0.1);
    expect([...heavy]).toEqual([2]);
  });

  it('scales an unpriced line by the same factor', () => {
    const { materials } = scaleToBudget([line(1, 100, 10), line(2, 100, null)], 500);
    expect(materials.map((m) => m.remainingQuantity)).toEqual([50, 50]);
  });
});
