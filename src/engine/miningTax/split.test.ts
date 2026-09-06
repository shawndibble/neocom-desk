import { describe, expect, it } from 'vitest';
import { planSplit } from './split';

const A = 45490;
const B = 45491;

describe('planSplit', () => {
  const original = [
    { typeId: A, quantity: 100 },
    { typeId: B, quantity: 50 },
  ];

  it('moves part of one type and keeps the rest, dropping emptied and zero lines', () => {
    const plan = planSplit(original, [
      { typeId: A, quantity: 40 },
      { typeId: B, quantity: 0 },
    ]);
    expect(plan.kept).toEqual([
      { typeId: A, quantity: 60 },
      { typeId: B, quantity: 50 },
    ]);
    expect(plan.moved).toEqual([{ typeId: A, quantity: 40 }]);
  });

  it('drops a fully moved line from the kept side', () => {
    const plan = planSplit(original, [{ typeId: B, quantity: 50 }]);
    expect(plan.kept).toEqual([{ typeId: A, quantity: 100 }]);
    expect(plan.moved).toEqual([{ typeId: B, quantity: 50 }]);
  });

  it('refuses to move more than the original holds', () => {
    expect(() => planSplit(original, [{ typeId: A, quantity: 101 }])).toThrow();
    expect(() => planSplit(original, [{ typeId: 999, quantity: 1 }])).toThrow();
  });
});
