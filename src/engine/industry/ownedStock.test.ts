import { describe, expect, it } from 'vitest';
import {
  bulkOwnedStockSuggestions,
  detectOwnedStock,
  suggestedOwnedQuantity,
  type DetectedOwnedStockMap,
  type OwnedStockSource,
  type StockAsset,
} from './ownedStock';

const STATION = 60003760;
const OTHER_STATION = 60008494;
const TRITANIUM = 34;
const PYERITE = 35;
const ISOGEN = 37;

function asset(
  overrides: Partial<StockAsset> & Pick<StockAsset, 'item_id' | 'type_id'>
): StockAsset {
  return {
    quantity: 1,
    location_id: STATION,
    location_type: 'station',
    location_flag: 'Hangar',
    is_singleton: false,
    ...overrides,
  };
}

function source(characterId: number, assets: readonly StockAsset[]): OwnedStockSource {
  return { characterId, assets };
}

const MATERIALS = new Set([TRITANIUM, PYERITE]);

describe('detectOwnedStock', () => {
  it('returns nothing for an empty asset list', () => {
    expect(detectOwnedStock([source(1, [])], MATERIALS).size).toBe(0);
  });

  it('counts a plain hangar stack', () => {
    const stock = detectOwnedStock(
      [source(1, [asset({ item_id: 1, type_id: TRITANIUM, quantity: 5000 })])],
      MATERIALS
    );
    expect(stock.get(TRITANIUM)).toEqual({
      quantity: 5000,
      placements: [
        { characterId: 1, locationId: STATION, locationType: 'station', quantity: 5000 },
      ],
    });
  });

  it('counts a stack inside a station container, attributed to the station', () => {
    const container = asset({ item_id: 10, type_id: 3465, is_singleton: true });
    const inside = asset({
      item_id: 11,
      type_id: TRITANIUM,
      quantity: 900,
      location_id: container.item_id,
      location_type: 'item',
      location_flag: 'AutoFit',
    });
    const stock = detectOwnedStock([source(1, [container, inside])], MATERIALS);
    expect(stock.get(TRITANIUM)?.quantity).toBe(900);
    expect(stock.get(TRITANIUM)?.placements[0]?.locationId).toBe(STATION);
  });

  it('excludes a fitted module', () => {
    const ship = asset({ item_id: 20, type_id: 621, is_singleton: true });
    const module = asset({
      item_id: 21,
      type_id: TRITANIUM,
      quantity: 1,
      location_id: ship.item_id,
      location_type: 'item',
      location_flag: 'HiSlot0',
    });
    expect(detectOwnedStock([source(1, [ship, module])], MATERIALS).size).toBe(0);
  });

  it("excludes items in a ship's cargo hold and drone bay", () => {
    const ship = asset({ item_id: 30, type_id: 621, is_singleton: true });
    const cargo = asset({
      item_id: 31,
      type_id: TRITANIUM,
      quantity: 400,
      location_id: ship.item_id,
      location_type: 'item',
      location_flag: 'Cargo',
    });
    const drones = asset({
      item_id: 32,
      type_id: PYERITE,
      quantity: 5,
      location_id: ship.item_id,
      location_type: 'item',
      location_flag: 'DroneBay',
    });
    expect(detectOwnedStock([source(1, [ship, cargo, drones])], MATERIALS).size).toBe(0);
  });

  it('excludes a stack nested in a container inside a ship hold', () => {
    const ship = asset({ item_id: 40, type_id: 621, is_singleton: true });
    const can = asset({
      item_id: 41,
      type_id: 3465,
      is_singleton: true,
      location_id: ship.item_id,
      location_type: 'item',
      location_flag: 'Cargo',
    });
    const inside = asset({
      item_id: 42,
      type_id: TRITANIUM,
      quantity: 700,
      location_id: can.item_id,
      location_type: 'item',
      location_flag: 'AutoFit',
    });
    expect(detectOwnedStock([source(1, [ship, can, inside])], MATERIALS).size).toBe(0);
  });

  it.each(['FleetHangar', 'ShipHangar', 'SpecializedOreHold', 'SpecializedFuelBay'])(
    'excludes stock in a ship %s, not just its cargo hold',
    (locationFlag) => {
      // Otherwise minerals in a docked freighter's fleet hangar would count as
      // station stock while the same minerals in its cargo hold did not.
      const ship = asset({ item_id: 45, type_id: 20185, is_singleton: true });
      const held = asset({
        item_id: 46,
        type_id: TRITANIUM,
        quantity: 1500,
        location_id: ship.item_id,
        location_type: 'item',
        location_flag: locationFlag,
      });
      expect(detectOwnedStock([source(1, [ship, held])], MATERIALS).size).toBe(0);
    }
  );

  it('still counts a station container whose flag merely looks specialized', () => {
    const container = asset({ item_id: 47, type_id: 17368, is_singleton: true });
    const inside = asset({
      item_id: 48,
      type_id: TRITANIUM,
      quantity: 60,
      location_id: container.item_id,
      location_type: 'item',
      location_flag: 'Unlocked',
    });
    expect(
      detectOwnedStock([source(1, [container, inside])], MATERIALS).get(TRITANIUM)?.quantity
    ).toBe(60);
  });

  it('excludes an assembled (singleton) item', () => {
    const stock = detectOwnedStock(
      [source(1, [asset({ item_id: 50, type_id: TRITANIUM, quantity: 1, is_singleton: true })])],
      MATERIALS
    );
    expect(stock.size).toBe(0);
  });

  it('sums one typeID across several locations and several characters', () => {
    const stock = detectOwnedStock(
      [
        source(1, [
          asset({ item_id: 60, type_id: TRITANIUM, quantity: 100 }),
          asset({
            item_id: 61,
            type_id: TRITANIUM,
            quantity: 250,
            location_id: OTHER_STATION,
          }),
        ]),
        source(2, [asset({ item_id: 62, type_id: TRITANIUM, quantity: 700 })]),
      ],
      MATERIALS
    );
    expect(stock.get(TRITANIUM)?.quantity).toBe(1050);
    expect(stock.get(TRITANIUM)?.placements).toEqual([
      { characterId: 2, locationId: STATION, locationType: 'station', quantity: 700 },
      { characterId: 1, locationId: OTHER_STATION, locationType: 'station', quantity: 250 },
      { characterId: 1, locationId: STATION, locationType: 'station', quantity: 100 },
    ]);
  });

  it('merges separate stacks of one typeID at the same location into one placement', () => {
    const stock = detectOwnedStock(
      [
        source(1, [
          asset({ item_id: 70, type_id: PYERITE, quantity: 10 }),
          asset({ item_id: 71, type_id: PYERITE, quantity: 32 }),
        ]),
      ],
      MATERIALS
    );
    expect(stock.get(PYERITE)?.quantity).toBe(42);
    expect(stock.get(PYERITE)?.placements).toHaveLength(1);
  });

  it('ignores a typeID the plan does not use', () => {
    const stock = detectOwnedStock(
      [source(1, [asset({ item_id: 80, type_id: ISOGEN, quantity: 9000 })])],
      MATERIALS
    );
    expect(stock.has(ISOGEN)).toBe(false);
  });

  it('attributes a stack whose parent is missing from the list to that parent id', () => {
    // A personal-hangar division inside a player structure: ESI never returns
    // the parent as its own asset row, but the stack is still owned stock.
    const orphan = asset({
      item_id: 90,
      type_id: TRITANIUM,
      quantity: 1200,
      location_id: 1035466617946,
      location_type: 'item',
      location_flag: 'Hangar',
    });
    const stock = detectOwnedStock([source(1, [orphan])], MATERIALS);
    expect(stock.get(TRITANIUM)?.placements).toEqual([
      { characterId: 1, locationId: 1035466617946, locationType: 'item', quantity: 1200 },
    ]);
  });

  it('survives a parent cycle without looping forever', () => {
    const a = asset({
      item_id: 100,
      type_id: TRITANIUM,
      quantity: 3,
      location_id: 101,
      location_type: 'item',
      location_flag: 'Hangar',
    });
    const b = asset({
      item_id: 101,
      type_id: 3465,
      is_singleton: true,
      location_id: 100,
      location_type: 'item',
      location_flag: 'Hangar',
    });
    expect(() => detectOwnedStock([source(1, [a, b])], MATERIALS)).not.toThrow();
    expect(detectOwnedStock([source(1, [a, b])], MATERIALS).get(TRITANIUM)?.quantity).toBe(3);
  });

  it('counts stock floating in space (jetcan) — any location counts', () => {
    const stock = detectOwnedStock(
      [
        source(1, [
          asset({
            item_id: 110,
            type_id: PYERITE,
            quantity: 88,
            location_id: 30000142,
            location_type: 'solar_system',
          }),
        ]),
      ],
      MATERIALS
    );
    expect(stock.get(PYERITE)?.placements[0]?.locationType).toBe('solar_system');
  });
});

describe('suggestedOwnedQuantity', () => {
  it('clamps the detected total to what the job actually needs', () => {
    // The field means "units this plan draws on", not "units owned in New
    // Eden": storing the raw total would silently cover a bigger requirement
    // if runs went up later.
    expect(suggestedOwnedQuantity(9000, 1000)).toBe(1000);
  });

  it('keeps the detected total when it falls short of the requirement', () => {
    expect(suggestedOwnedQuantity(400, 1000)).toBe(400);
  });
});

describe('bulkOwnedStockSuggestions', () => {
  const MATERIALS = [
    { typeID: TRITANIUM, quantity: 1000 },
    { typeID: PYERITE, quantity: 200 },
    { typeID: ISOGEN, quantity: 50 },
  ];

  function stockOf(entries: Record<number, number>): DetectedOwnedStockMap {
    return new Map(
      Object.entries(entries).map(([typeID, quantity]) => [
        Number(typeID),
        { quantity, placements: [] },
      ])
    );
  }

  it('fills every row with detected stock and nothing typed in it', () => {
    expect(
      bulkOwnedStockSuggestions(MATERIALS, undefined, stockOf({ [TRITANIUM]: 9000, [PYERITE]: 30 }))
    ).toEqual([
      { typeID: TRITANIUM, ownedQuantity: 1000 },
      { typeID: PYERITE, ownedQuantity: 30 },
    ]);
  });

  it('leaves a hand-typed value untouched, including a deliberate zero', () => {
    const sourcing = { [TRITANIUM]: { ownedQuantity: 0 }, [PYERITE]: { ownedQuantity: 12 } };
    expect(
      bulkOwnedStockSuggestions(
        MATERIALS,
        sourcing,
        stockOf({ [TRITANIUM]: 9000, [PYERITE]: 30, [ISOGEN]: 4 })
      )
    ).toEqual([{ typeID: ISOGEN, ownedQuantity: 4 }]);
  });

  it('ignores an entry that only carries an override price', () => {
    const sourcing = { [TRITANIUM]: { overridePrice: 6 } };
    expect(bulkOwnedStockSuggestions(MATERIALS, sourcing, stockOf({ [TRITANIUM]: 250 }))).toEqual([
      { typeID: TRITANIUM, ownedQuantity: 250 },
    ]);
  });

  it('suggests nothing for a material with no detected stock', () => {
    expect(bulkOwnedStockSuggestions(MATERIALS, undefined, stockOf({}))).toEqual([]);
  });
});
