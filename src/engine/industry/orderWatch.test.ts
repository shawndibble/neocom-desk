import { describe, it, expect } from 'vitest';
import { computeOrderFillQuantity } from '@/engine/industry/orderWatch';

describe('computeOrderFillQuantity', () => {
  it('is the drop in volume_remain since the watch started', () => {
    expect(computeOrderFillQuantity(100, 60)).toBe(40);
  });

  it('is zero for an order that has not moved', () => {
    expect(computeOrderFillQuantity(100, 100)).toBe(0);
  });

  it('never goes negative, even if volume_remain somehow increased (e.g. a re-issued order)', () => {
    expect(computeOrderFillQuantity(50, 80)).toBe(0);
  });

  it('is the full initial amount once nothing remains', () => {
    expect(computeOrderFillQuantity(25, 0)).toBe(25);
  });
});
