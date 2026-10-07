import { describe, expect, it } from 'vitest';
import { planConsolidation, type ConsolidationAsset } from './consolidation';

const DEST = 60003760;
const OTHER = 60008494;

function asset(overrides: Partial<ConsolidationAsset> & Pick<ConsolidationAsset, 'itemId'>) {
  return {
    typeId: 34,
    quantity: 1,
    locationId: OTHER,
    locationType: 'station',
    isSingleton: false,
    ...overrides,
  } satisfies ConsolidationAsset;
}

const plan = (assets: ConsolidationAsset[], capacity: number | null = null) =>
  planConsolidation({
    destinationLocationId: DEST,
    characters: [{ characterId: 1, name: 'Alice', assets }],
    unitM3: new Map([
      [34, 0.01],
      [35, 2],
    ]),
    holdsCapacityM3: capacity,
  });

describe('planConsolidation', () => {
  it('skips assets already at the destination', () => {
    const result = plan([asset({ itemId: 1, locationId: DEST, quantity: 5 })]);
    expect(result.perCharacter).toEqual([]);
    expect(result.totalM3).toBe(0);
  });

  it('skips assembled items and anything nested in a container or ship', () => {
    const result = plan([
      asset({ itemId: 1, isSingleton: true }),
      asset({ itemId: 2, locationType: 'item', locationId: 99 }),
    ]);
    expect(result.perCharacter).toEqual([]);
  });

  it('merges stacks of one type per Character and totals their volume', () => {
    const result = plan([
      asset({ itemId: 1, quantity: 100 }),
      asset({ itemId: 2, quantity: 300, locationId: 60000001 }),
      asset({ itemId: 3, typeId: 35, quantity: 10 }),
    ]);
    const alice = result.perCharacter[0];
    expect(alice?.lines).toEqual([
      { typeId: 35, quantity: 10, m3: 20 },
      { typeId: 34, quantity: 400, m3: 4 },
    ]);
    expect(alice?.totalM3).toBe(24);
    expect(result.totalM3).toBe(24);
  });

  it('counts unknown-volume types without adding to the total', () => {
    const result = plan([asset({ itemId: 1, typeId: 999, quantity: 3 })]);
    const alice = result.perCharacter[0];
    expect(alice?.lines).toEqual([{ typeId: 999, quantity: 3, m3: null }]);
    expect(alice?.unknownTypeCount).toBe(1);
    expect(alice?.totalM3).toBe(0);
    expect(result.trips).toBeNull();
  });

  it('computes trips against the Cargo Space, rounded up', () => {
    const result = plan([asset({ itemId: 1, typeId: 35, quantity: 10 })], 8);
    expect(result.trips).toBe(3);
  });

  it('gives no trips without a Cargo Space', () => {
    expect(plan([asset({ itemId: 1, typeId: 35 })], null).trips).toBeNull();
    expect(plan([asset({ itemId: 1, typeId: 35 })], 0).trips).toBeNull();
  });
});
