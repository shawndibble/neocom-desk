import { describe, it, expect } from 'vitest';
import { marketTypeEntry, roundVolume } from './marketTypeVolumes.mjs';

const MERLIN = { name: 'Merlin', marketGroupID: 61, volume: 16500 };
const TRITANIUM = { name: 'Tritanium', marketGroupID: 1857, volume: 0.01 };

describe('roundVolume', () => {
  it('keeps small volumes instead of rounding them to zero', () => {
    expect(roundVolume(0.01)).toBe(0.01);
    expect(roundVolume(0.0001)).toBe(0.0001);
  });

  it('trims float noise to six significant figures', () => {
    expect(roundVolume(0.30000000000000004)).toBe(0.3);
    expect(roundVolume(27289.5)).toBe(27289.5);
    expect(roundVolume(1234567.891)).toBe(1234570);
  });
});

describe('marketTypeEntry', () => {
  it('carries the packaged volume for a hull whose packaged figure differs', () => {
    expect(marketTypeEntry(603, MERLIN, 2500)).toEqual({
      typeId: 603,
      name: 'Merlin',
      marketGroupId: 61,
      volume: 16500,
      packagedVolume: 2500,
    });
  });

  it('omits packagedVolume when it equals the volume', () => {
    expect(marketTypeEntry(34, TRITANIUM, 0.01)).toEqual({
      typeId: 34,
      name: 'Tritanium',
      marketGroupId: 1857,
      volume: 0.01,
    });
  });

  it('omits packagedVolume when it only differs by float noise', () => {
    const entry = marketTypeEntry(34, { ...TRITANIUM, volume: 0.1 }, 0.10000000000000002);
    expect(entry).not.toHaveProperty('packagedVolume');
  });

  it('omits packagedVolume when the probe had nothing for the type', () => {
    expect(marketTypeEntry(603, MERLIN, undefined)).not.toHaveProperty('packagedVolume');
  });

  it('ignores an unusable packaged volume', () => {
    expect(marketTypeEntry(603, MERLIN, 0)).not.toHaveProperty('packagedVolume');
    expect(marketTypeEntry(603, MERLIN, Number.NaN)).not.toHaveProperty('packagedVolume');
  });
});
