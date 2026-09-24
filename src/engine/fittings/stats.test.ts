import { describe, expect, it } from 'vitest';
import { extractFittingStats } from './stats';
import { DOGMA_ATTRIBUTE } from './types';

function attrs(
  values: Partial<Record<keyof typeof DOGMA_ATTRIBUTE, number>>
): Map<number, { value: number }> {
  const map = new Map<number, { value: number }>();
  for (const [key, value] of Object.entries(values)) {
    map.set(DOGMA_ATTRIBUTE[key as keyof typeof DOGMA_ATTRIBUTE], { value });
  }
  return map;
}

describe('extractFittingStats', () => {
  it('reads cpu/powergrid used and total from output minus free', () => {
    const stats = extractFittingStats(
      [],
      attrs({
        cpuOutput: 400,
        cpuFree: 150,
        powerOutput: 1000,
        powerFree: 200,
      }),
      []
    );

    expect(stats.cpuTotal).toBe(400);
    expect(stats.cpuUsed).toBe(250);
    expect(stats.powergridTotal).toBe(1000);
    expect(stats.powergridUsed).toBe(800);
  });

  it('reads ehp and drone dps straight from the engine-derived attributes', () => {
    const stats = extractFittingStats([], attrs({ ehp: 24187.5, droneDamagePerSecond: 171.3 }), []);

    expect(stats.ehp).toBeCloseTo(24187.5, 6);
    expect(stats.droneDps).toBeCloseTo(171.3, 6);
  });

  it('reports a stable capacitor by its settle percentage when depletesIn is negative', () => {
    const stats = extractFittingStats(
      [],
      attrs({ capacitorDepletesIn: -1, capacitorStablePercentage: 62 }),
      []
    );

    expect(stats.capacitor).toEqual({ stable: true, stablePercentage: 62 });
  });

  it('reports an unstable capacitor by seconds to empty when depletesIn is non-negative', () => {
    const stats = extractFittingStats(
      [],
      attrs({ capacitorDepletesIn: 86.625, capacitorStablePercentage: 0 }),
      []
    );

    expect(stats.capacitor).toEqual({ stable: false, depletesInSeconds: 86.625 });
  });

  it('collects the type ids of items the engine returned empty attributes for', () => {
    const stats = extractFittingStats([4405, 999999999, 2488], attrs({}), [
      { attributes: new Map([[1, { value: 1 }]]) },
      { attributes: new Map() },
      { attributes: new Map([[2, { value: 1 }]]) },
    ]);

    expect(stats.unknownItemTypeIds).toEqual([999999999]);
  });

  it('treats every attribute as 0 when the ship result carries none at all', () => {
    const stats = extractFittingStats([], new Map(), []);

    expect(stats.cpuUsed).toBe(0);
    expect(stats.ehp).toBe(0);
    expect(stats.droneDps).toBe(0);
  });
});
