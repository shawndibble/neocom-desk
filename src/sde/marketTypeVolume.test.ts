import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { packagedVolumeOf, type MarketTypeEntry } from '@/sde/marketTypes';

// The shipped snapshot itself, so a rebuild that drops or garbles the
// volumes fails here rather than in the UI (issue #2336).
const SNAPSHOT = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/market/types.json'), 'utf8')
) as MarketTypeEntry[];
const byId = new Map(SNAPSHOT.map((t) => [t.typeId, t]));

const MERLIN = 603;
const TRITANIUM = 34;

describe('packagedVolumeOf', () => {
  it('uses the packaged volume where the type has one', () => {
    const hull: MarketTypeEntry = {
      typeId: MERLIN,
      name: 'Merlin',
      marketGroupId: 61,
      volume: 16500,
      packagedVolume: 2500,
    };
    expect(packagedVolumeOf(hull)).toBe(2500);
  });

  it('falls back to the volume where packaging changes nothing', () => {
    const mineral: MarketTypeEntry = {
      typeId: TRITANIUM,
      name: 'Tritanium',
      marketGroupId: 1857,
      volume: 0.01,
    };
    expect(packagedVolumeOf(mineral)).toBe(0.01);
  });
});

describe('market/types.json volumes', () => {
  it('ships a frigate hull at its packaged 2,500 m3', () => {
    const merlin = byId.get(MERLIN)!;
    expect(merlin.volume).toBe(16500);
    expect(merlin.packagedVolume).toBe(2500);
    expect(packagedVolumeOf(merlin)).toBe(2500);
  });

  it('ships a mineral at 0.01 m3 with no separate packaged figure', () => {
    const tritanium = byId.get(TRITANIUM)!;
    expect(tritanium.volume).toBe(0.01);
    expect(tritanium).not.toHaveProperty('packagedVolume');
  });

  it('gives every market type a volume', () => {
    expect(SNAPSHOT.every((t) => typeof t.volume === 'number' && t.volume >= 0)).toBe(true);
  });

  it('only writes packagedVolume where it differs from volume', () => {
    expect(SNAPSHOT.some((t) => t.packagedVolume === t.volume)).toBe(false);
  });
});
