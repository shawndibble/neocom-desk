import { describe, expect, it } from 'vitest';
import { findShips, sortShipsByJumps, type OwnedAsset, type ShipRow } from './myShips';

const SHIP_TYPES = new Set([100, 101]);
const isShip = (typeId: number) => SHIP_TYPES.has(typeId);

function asset(over: Partial<OwnedAsset> & { item_id: number }): OwnedAsset {
  return {
    type_id: 1,
    quantity: 1,
    location_id: 60000001,
    location_type: 'station',
    location_flag: 'Hangar',
    is_singleton: true,
    characterId: 1,
    ...over,
  };
}

describe('findShips', () => {
  it('picks ships by type, skips everything else', () => {
    const rows = findShips(
      [asset({ item_id: 1, type_id: 100 }), asset({ item_id: 2, type_id: 5 })],
      isShip
    );
    expect(rows.map((r) => r.itemId)).toEqual([1]);
  });

  it('skips unassembled (non-singleton) hulls', () => {
    const rows = findShips(
      [asset({ item_id: 1, type_id: 100, is_singleton: false, quantity: 3 })],
      isShip
    );
    expect(rows).toEqual([]);
  });

  it('keeps the owning character and root location', () => {
    const [row] = findShips([asset({ item_id: 1, type_id: 100, characterId: 7 })], isShip);
    expect(row).toMatchObject({
      itemId: 1,
      typeId: 100,
      characterId: 7,
      locationId: 60000001,
      locationType: 'station',
      inCargo: false,
      trail: [],
    });
  });

  it('finds a ship nested in a ship cargo hold and tags it with its trail', () => {
    const rows = findShips(
      [
        asset({ item_id: 10, type_id: 101 }),
        asset({
          item_id: 11,
          type_id: 100,
          location_id: 10,
          location_type: 'item',
          location_flag: 'Cargo',
        }),
      ],
      isShip
    );
    expect(rows.find((r) => r.itemId === 11)).toMatchObject({
      inCargo: true,
      trail: [10],
      locationId: 60000001,
      locationType: 'station',
    });
    expect(rows.find((r) => r.itemId === 10)?.inCargo).toBe(false);
  });

  it('walks a ship inside a container inside a hangar', () => {
    const [row] = findShips(
      [
        asset({ item_id: 20, type_id: 3 }),
        asset({ item_id: 21, type_id: 3, location_id: 20, location_type: 'item' }),
        asset({ item_id: 22, type_id: 100, location_id: 21, location_type: 'item' }),
      ],
      isShip
    );
    expect(row).toMatchObject({ itemId: 22, inCargo: true, trail: [20, 21], locationId: 60000001 });
  });

  it('roots a ship whose parent is not an owned asset (player structure) at that parent', () => {
    const [row] = findShips(
      [asset({ item_id: 1, type_id: 100, location_id: 1234567890123, location_type: 'item' })],
      isShip
    );
    expect(row).toMatchObject({ locationId: 1234567890123, inCargo: false, trail: [] });
  });

  it('survives a parent cycle', () => {
    const rows = findShips(
      [
        asset({ item_id: 1, type_id: 100, location_id: 2, location_type: 'item' }),
        asset({ item_id: 2, type_id: 100, location_id: 1, location_type: 'item' }),
      ],
      isShip
    );
    expect(rows).toHaveLength(2);
  });
});

function row(itemId: number, locationId: number): ShipRow {
  return {
    itemId,
    typeId: 100,
    characterId: 1,
    locationId,
    locationType: 'station',
    inCargo: false,
    trail: [],
  };
}

describe('sortShipsByJumps', () => {
  it('sorts ascending with unknown last, stable among ties', () => {
    const rows = [row(1, 10), row(2, 20), row(3, 30), row(4, 40), row(5, 20)];
    const jumps = new Map<number, number | null>([
      [10, 5],
      [20, 0],
      [30, null],
    ]);
    const sorted = sortShipsByJumps(rows, (r) => jumps.get(r.locationId));
    expect(sorted.map((r) => r.itemId)).toEqual([2, 5, 1, 3, 4]);
  });
});
