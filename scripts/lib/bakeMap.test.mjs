import { describe, expect, it } from 'vitest';
import {
  bakeGatePositions,
  mapJumpPairs,
  mapRegions,
  mapSystems,
  planetRadiiKm,
} from './bakeMap.mjs';

describe('CCP map tables', () => {
  it('reads systems ordered by id, with English names', () => {
    const out = mapSystems([
      {
        _key: 2,
        name: { en: 'B' },
        securityStatus: 0.5,
        regionID: 9,
        position: { x: 1, y: 2, z: 3 },
      },
      { _key: 1, name: { en: 'A' }, regionID: 9 },
    ]);
    expect(out.map((s) => s.id)).toEqual([1, 2]);
    expect(out[0]).toMatchObject({ name: 'A', security: 0, x: 0 });
    expect(out[1]).toMatchObject({ security: 0.5, regionId: 9, z: 3 });
  });

  it('reads regions ordered by id', () => {
    expect(
      mapRegions([
        { _key: 5, name: { en: 'E' } },
        { _key: 1, name: { en: 'A' } },
      ])
    ).toEqual([
      { id: 1, name: 'A' },
      { id: 5, name: 'E' },
    ]);
  });

  it('turns each stargate into a from/to pair', () => {
    expect(mapJumpPairs([{ solarSystemID: 1, destination: { solarSystemID: 2 } }])).toEqual([
      [1, 2],
    ]);
  });

  it('bakes gate positions in Mm, per system, by destination', () => {
    const gate = (from, to, x) => ({
      solarSystemID: from,
      destination: { solarSystemID: to },
      position: { x, y: -2e9, z: 0 },
    });
    expect(bakeGatePositions([gate(1, 9, 3e9), gate(1, 4, 1.5e9), gate(2, 1, 0)])).toEqual({
      1: [4, 1500, -2000, 0, 9, 3000, -2000, 0],
      2: [1, 0, -2000, 0],
    });
  });

  it('rounds planet radii to km and skips planets without one', () => {
    expect(
      planetRadiiKm([{ _key: 1, radius: 5_060_000 }, { _key: 2 }, { _key: 3, radius: 0 }])
    ).toEqual({
      1: 5060,
    });
  });
});
