import { describe, it, expect } from 'vitest';
import { computeAssignmentValue } from './valuation';
import type { OreLine } from './types';

const A = 45490;
const B = 45491;

describe('computeAssignmentValue', () => {
  it('values ore lines at the given per-unit prices and applies the tax percent', () => {
    const lines: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
    ];
    const prices = new Map([
      [A, 10],
      [B, 4],
    ]);

    const result = computeAssignmentValue(lines, prices, 10);

    // 100*10 + 50*4 = 1200; 10% of 1200 = 120
    expect(result).toEqual({ estimatedValue: 1200, taxOwed: 120 });
  });

  it('treats a type with no known price as contributing zero value, not throwing', () => {
    const lines: OreLine[] = [{ typeId: A, quantity: 100 }];
    const result = computeAssignmentValue(lines, new Map(), 10);
    expect(result).toEqual({ estimatedValue: 0, taxOwed: 0 });
  });

  it('returns zero for an empty ore-line list', () => {
    expect(computeAssignmentValue([], new Map(), 10)).toEqual({
      estimatedValue: 0,
      taxOwed: 0,
    });
  });

  it('is a pure snapshot: the same inputs always produce the same output', () => {
    const lines: OreLine[] = [{ typeId: A, quantity: 7 }];
    const prices = new Map([[A, 3.5]]);
    expect(computeAssignmentValue(lines, prices, 15)).toEqual(
      computeAssignmentValue(lines, prices, 15)
    );
  });
});
