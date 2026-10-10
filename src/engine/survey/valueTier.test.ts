import { describe, expect, it } from 'vitest';
import { oreValueTiers, valuePerM3 } from './valueTier';

const ore = (name: string, volume: number, isk: number) => ({
  ore: name,
  rocks: 1,
  volume,
  isk,
  startVolume: volume,
  unitPrice: null,
});

describe('valuePerM3', () => {
  it('is the ISK value of what is left over the m3 left', () => {
    expect(valuePerM3({ volume: 2000, isk: 200_000 })).toBe(100);
  });

  it('is null when there is nothing left or no value to divide', () => {
    expect(valuePerM3({ volume: 0, isk: 0 })).toBeNull();
    expect(valuePerM3({ volume: 100, isk: 0 })).toBeNull();
  });
});

describe('oreValueTiers', () => {
  it('grades each ore by its ISK per m3 against the richest one: gray, blue, yellow, orange', () => {
    const tiers = oreValueTiers([
      ore('Best', 1000, 100_000), // 100/m3, the richest
      ore('Close', 1000, 92_000), // 92%
      ore('Middling', 1000, 80_000), // 80%
      ore('Lean', 1000, 60_000), // 60%
      ore('Poor', 1000, 30_000), // 30%
    ]);
    expect(tiers.get('Best')).toBe('orange');
    expect(tiers.get('Close')).toBe('orange');
    expect(tiers.get('Middling')).toBe('yellow');
    expect(tiers.get('Lean')).toBe('blue');
    expect(tiers.get('Poor')).toBe('gray');
  });

  it('is about value per m3, not total value: a small rich ore beats a big poor one', () => {
    const tiers = oreValueTiers([
      ore('Big poor', 100_000, 3_000_000),
      ore('Small rich', 1000, 90_000),
    ]);
    expect(tiers.get('Small rich')).toBe('orange');
    expect(tiers.get('Big poor')).toBe('gray');
  });

  it('is gray for an ore with nothing left, and for every ore when no scan carried ISK', () => {
    const mined = { ore: 'Gone', rocks: 0, volume: 0, isk: 0, startVolume: 500, unitPrice: null };
    expect(oreValueTiers([ore('Real', 1000, 50_000), mined]).get('Gone')).toBe('gray');
    const noIsk = oreValueTiers([ore('A', 1000, 0), ore('B', 500, 0)]);
    expect([...noIsk.values()]).toEqual(['gray', 'gray']);
  });
});
