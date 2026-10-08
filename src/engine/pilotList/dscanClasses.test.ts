import { describe, expect, it } from 'vitest';
import { bucketDscan, type DscanTypeInfo } from './dscanClasses';

const SHIP = 6;
const INFO: Record<number, DscanTypeInfo> = {
  1: { groupId: 547, categoryId: SHIP }, // Carrier
  2: { groupId: 832, categoryId: SHIP }, // Logistics
  3: { groupId: 1657, categoryId: 65 }, // Citadel
  4: { groupId: 186, categoryId: 29 }, // Wreck
  5: { groupId: 26, categoryId: SHIP }, // Cruiser
  6: { groupId: 100, categoryId: 18 }, // Drone
};

describe('bucketDscan', () => {
  it('counts types into class buckets in a fixed order, skipping empty ones', () => {
    const result = bucketDscan([5, 5, 1, 2, 4, 4, 4, 3], (id) => INFO[id]);
    expect(result.classes.map((c) => [c.bucket, c.total])).toEqual([
      ['capitals', 1],
      ['logistics', 1],
      ['structures', 1],
      ['wrecks', 3],
      ['ships', 2],
    ]);
  });

  it('lists each type once with its count, most numerous first', () => {
    const result = bucketDscan([5, 5, 5, 1], (id) => INFO[id]);
    expect(result.classes.find((c) => c.bucket === 'ships')?.types).toEqual([
      { typeId: 5, count: 3 },
    ]);
  });

  it('counts drones, probes and unknown types as left out', () => {
    const result = bucketDscan([6, 6, 99, 5], (id) => INFO[id]);
    expect(result.leftOut).toBe(3);
    expect(result.classes.map((c) => c.bucket)).toEqual(['ships']);
  });
});
