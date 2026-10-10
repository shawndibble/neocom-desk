import { describe, expect, it } from 'vitest';
import { oreValueTiers } from './valueTier';

const ore = (name: string, unitPrice: number | null) => ({ ore: name, unitPrice });

describe('oreValueTiers', () => {
  it('grades each ore by unit price between the cheapest and dearest: gray, blue, yellow, orange', () => {
    const tiers = oreValueTiers([
      ore('Best', 100), // top of the range
      ore('Close', 90), // 80%
      ore('Middling', 70), // 60%
      ore('Lean', 40), // 30%
      ore('Poor', 10), // bottom of the range
    ]);
    expect(tiers.get('Best')).toBe('orange');
    expect(tiers.get('Close')).toBe('orange');
    expect(tiers.get('Middling')).toBe('yellow');
    expect(tiers.get('Lean')).toBe('blue');
    expect(tiers.get('Poor')).toBe('gray');
  });

  it('always makes the dearest ore orange and the cheapest gray, however close their prices', () => {
    const tiers = oreValueTiers([ore('Dear', 101), ore('Cheap', 100)]);
    expect(tiers.get('Dear')).toBe('orange');
    expect(tiers.get('Cheap')).toBe('gray');
  });

  it('is gray for an unpriced ore, and for every ore when no price is known', () => {
    expect(oreValueTiers([ore('Real', 50), ore('Odd', null)]).get('Odd')).toBe('gray');
    expect([...oreValueTiers([ore('A', null), ore('B', null)]).values()]).toEqual(['gray', 'gray']);
  });

  it('makes a lone priced ore, or ores all at one price, orange: the dearest there is', () => {
    expect(oreValueTiers([ore('Only', 50)]).get('Only')).toBe('orange');
    expect(oreValueTiers([ore('Only', 50), ore('Odd', null)]).get('Only')).toBe('orange');
    expect([...oreValueTiers([ore('A', 50), ore('B', 50)]).values()]).toEqual(['orange', 'orange']);
  });
});
