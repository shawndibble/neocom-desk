import { describe, it, expect } from 'vitest';
import { salesCapPerDay, thinSales } from './salesCap';

describe('salesCapPerDay', () => {
  it('is the share of the hub region daily volume', () => {
    expect(salesCapPerDay(2100, 10)).toBeCloseTo(210);
  });
  it('is no cap when the volume is unknown', () => {
    expect(salesCapPerDay(undefined, 10)).toBeUndefined();
  });
  it('is a real zero for a type that sold none', () => {
    expect(salesCapPerDay(0, 10)).toBe(0);
  });
});

describe('thinSales', () => {
  it('names the plan, the market and the counted units when output is over the share', () => {
    expect(thinSales(355, 2100, 10)).toEqual({
      planPerDay: 355,
      tradesPerDay: 2100,
      countedPerDay: 210,
      sharePct: 10,
    });
  });
  it('is null at or under the share', () => {
    expect(thinSales(210, 2100, 10)).toBeNull();
    expect(thinSales(50, 2100, 10)).toBeNull();
  });
  it('is null when the volume is unknown', () => {
    expect(thinSales(355, undefined, 10)).toBeNull();
  });
});
