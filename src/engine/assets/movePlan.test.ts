import { describe, expect, it } from 'vitest';
import type { ConsolidationAsset } from './consolidation';
import { planMove, type MoveHull } from './movePlan';

const DEST = 60003760;
const A = 60008494;
const B = 60011866;
const SHIP = 648;

function asset(overrides: Partial<ConsolidationAsset> & Pick<ConsolidationAsset, 'itemId'>) {
  return {
    typeId: 34,
    quantity: 1,
    locationId: A,
    locationType: 'station',
    isSingleton: false,
    ...overrides,
  } satisfies ConsolidationAsset;
}

const hull = (typeId: number, capacityM3: number, owned = false, canFly = true): MoveHull => ({
  typeId,
  name: `Hull ${typeId}`,
  hullClass: 'Industrial',
  capacityM3,
  owned,
  canFly,
});

const HULLS = [hull(1, 5000), hull(2, 1000, true), hull(3, 1000), hull(4, 400)];

const plan = (assets: ConsolidationAsset[], hulls: readonly MoveHull[] = HULLS) =>
  planMove({
    destinationLocationIds: new Set([DEST]),
    characters: [{ characterId: 1, name: 'Alice', assets }],
    unitM3: new Map([
      [34, 0.01],
      [35, 2],
    ]),
    shipTypeIds: new Set([SHIP]),
    hulls,
  });

describe('planMove', () => {
  it('totals and trips for a mixed list, grouped by pickup location', () => {
    const result = plan([
      asset({ itemId: 1, typeId: 35, quantity: 600 }), // 1200 m3 at A
      asset({ itemId: 2, typeId: 34, quantity: 5000, locationId: B }), // 50 m3 at B
      asset({ itemId: 3, typeId: SHIP, isSingleton: true, locationId: B }),
    ]);
    expect(result.totals).toMatchObject({
      stacks: 2,
      totalM3: 1250,
      characters: 1,
      shipsToFly: 1,
      unknownVolumeCount: 0,
      trips: 1,
    });
    expect(result.perCharacter[0].pickups.map((p) => p.locationId)).toEqual([A, B]);
    expect(result.perCharacter[0].pickups[1].ships).toEqual([{ itemId: 3, typeId: SHIP }]);
  });

  it('suggests the fewest trips and lists every hull best first', () => {
    const result = plan([asset({ itemId: 1, typeId: 35, quantity: 600 })]); // 1200 m3
    expect(result.suggested?.hull.typeId).toBe(1);
    expect(result.comparison.map((o) => [o.hull.typeId, o.trips])).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
    ]);
  });

  it('prefers the smaller hull when trips tie', () => {
    const result = plan(
      [asset({ itemId: 1, typeId: 35, quantity: 100 })], // 200 m3
      [hull(1, 5000), hull(4, 400)]
    );
    expect(result.suggested?.hull.typeId).toBe(4);
  });

  it('flags ownership without letting it change the order', () => {
    const result = plan(
      [asset({ itemId: 1, typeId: 35, quantity: 100 })],
      [hull(2, 1000, true), hull(3, 500)]
    );
    expect(result.suggested?.hull.typeId).toBe(3);
    expect(result.comparison.find((o) => o.hull.typeId === 2)?.hull.owned).toBe(true);
  });

  it('excludes ships from hold math', () => {
    const result = plan([asset({ itemId: 1, typeId: SHIP, isSingleton: true })]);
    expect(result.totals).toMatchObject({ totalM3: 0, shipsToFly: 1, trips: null });
    expect(result.suggested).toBeNull();
    expect(result.perCharacter).toHaveLength(1);
  });

  it('excludes items at the destination; nothing to move yields no characters', () => {
    const result = plan([
      asset({ itemId: 1, locationId: DEST, quantity: 5 }),
      asset({ itemId: 2, typeId: SHIP, isSingleton: true, locationId: DEST }),
    ]);
    expect(result.perCharacter).toEqual([]);
    expect(result.totals).toMatchObject({ stacks: 0, characters: 0, shipsToFly: 0 });
  });

  it('lists unknown-volume stacks, counts them and leaves them out of totals', () => {
    const result = plan([
      asset({ itemId: 1, typeId: 35, quantity: 10 }),
      asset({ itemId: 2, typeId: 9999, quantity: 7 }),
    ]);
    expect(result.totals).toMatchObject({ totalM3: 20, stacks: 1, unknownVolumeCount: 1 });
    expect(result.perCharacter[0].pickups[0].unknownVolume).toEqual([
      { typeId: 9999, quantity: 7 },
    ]);
  });

  it('skips assembled non-ship items and anything nested or in space', () => {
    const result = plan([
      asset({ itemId: 1, isSingleton: true }),
      asset({ itemId: 2, locationType: 'item', locationId: 99 }),
      asset({
        itemId: 3,
        typeId: SHIP,
        isSingleton: true,
        locationType: 'solar_system',
        locationId: 30000142,
      }),
    ]);
    expect(result.perCharacter).toEqual([]);
  });

  it('never suggests or compares a hull the pilot cannot fly', () => {
    const hulls = [hull(1, 5000, false, false), hull(4, 400)];
    const result = plan([asset({ itemId: 1, typeId: 35, quantity: 600 })], hulls); // 1200 m3
    expect(result.suggested?.hull.typeId).toBe(4);
    expect(result.comparison.map((o) => o.hull.typeId)).toEqual([4]);
    expect(
      plan([asset({ itemId: 1, typeId: 35, quantity: 600 })], [hull(1, 5000, false, false)])
        .suggested
    ).toBeNull();
  });

  it('hauls a ship packed instead as cargo at its packaged volume', () => {
    const withShip = (packed: number[]) =>
      planMove({
        destinationLocationIds: new Set([DEST]),
        characters: [
          {
            characterId: 1,
            name: 'Alice',
            assets: [asset({ itemId: 9, typeId: SHIP, isSingleton: true })],
          },
        ],
        unitM3: new Map([[SHIP, 500]]),
        shipTypeIds: new Set([SHIP]),
        packedShipIds: new Set(packed),
        hulls: HULLS,
      });
    expect(withShip([]).totals).toMatchObject({ shipsToFly: 1, totalM3: 0 });
    const packed = withShip([9]);
    expect(packed.totals).toMatchObject({ shipsToFly: 0, totalM3: 500, stacks: 1 });
    expect(packed.perCharacter[0].pickups[0].ships).toEqual([]);
    expect(packed.perCharacter[0].pickups[0].lines[0]).toMatchObject({ typeId: SHIP, quantity: 1 });
  });
});
