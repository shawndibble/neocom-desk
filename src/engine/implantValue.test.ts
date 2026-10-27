import { describe, expect, it } from 'vitest';
import { cooldownProgress, sumImplantValue } from './implantValue';

describe('sumImplantValue', () => {
  it('adds the price of every implant', () => {
    const prices = new Map<number, number | null>([
      [1, 1000],
      [2, 500],
    ]);
    expect(sumImplantValue([1, 2], prices)).toEqual({ total: 1500, unpriced: 0 });
  });

  it('counts implants with no price instead of treating them as free', () => {
    const prices = new Map<number, number | null>([
      [1, 1000],
      [2, null],
    ]);
    expect(sumImplantValue([1, 2, 3], prices)).toEqual({ total: 1000, unpriced: 2 });
  });

  it('is zero for no implants', () => {
    expect(sumImplantValue([], new Map())).toEqual({ total: 0, unpriced: 0 });
  });
});

describe('cooldownProgress', () => {
  const last = '2026-10-08T00:00:00Z';
  const at = (hours: number) => new Date(Date.parse(last) + hours * 3_600_000);

  it('is the elapsed share of the cooldown', () => {
    expect(cooldownProgress(last, 12, at(6))).toBe(0.5);
  });

  it('is full once the cooldown has passed', () => {
    expect(cooldownProgress(last, 12, at(20))).toBe(1);
  });

  it('is full with no jump on record or no cooldown', () => {
    expect(cooldownProgress(null, 12, at(1))).toBe(1);
    expect(cooldownProgress(last, 0, at(1))).toBe(1);
  });
});
