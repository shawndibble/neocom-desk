import { describe, expect, it } from 'vitest';
import {
  collectStockLocations,
  detectOwnedStock,
  filterStockByScope,
  ownedStockLocationKey,
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

function corpSource(
  characterId: number,
  corporationId: number,
  assets: readonly StockAsset[]
): OwnedStockSource {
  return { characterId, corporationId, assets };
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

describe('detectOwnedStock with a corporation source (issue #798)', () => {
  it('detects corp-only stock, tagged with the corporation, not the reading Director', () => {
    const stock = detectOwnedStock(
      [corpSource(1, 500, [asset({ item_id: 300, type_id: TRITANIUM, quantity: 4000 })])],
      MATERIALS
    );
    expect(stock.get(TRITANIUM)).toEqual({
      quantity: 4000,
      placements: [
        {
          characterId: 1,
          corporationId: 500,
          locationId: STATION,
          locationType: 'station',
          quantity: 4000,
        },
      ],
    });
  });

  it('sums a personal source and a corp source for the same material', () => {
    const stock = detectOwnedStock(
      [
        source(1, [asset({ item_id: 301, type_id: TRITANIUM, quantity: 100 })]),
        corpSource(1, 500, [asset({ item_id: 302, type_id: TRITANIUM, quantity: 4000 })]),
      ],
      MATERIALS
    );
    expect(stock.get(TRITANIUM)?.quantity).toBe(4100);
    expect(stock.get(TRITANIUM)?.placements).toHaveLength(2);
  });

  it('never collides a corp placement with a personal placement carrying the same numeric id at the same location', () => {
    // Corporation 1 happens to share a numeric id with Character 1 here —
    // the two must still be counted as distinct owners, not merged into one.
    const stock = detectOwnedStock(
      [
        source(1, [asset({ item_id: 303, type_id: TRITANIUM, quantity: 10 })]),
        corpSource(1, 1, [asset({ item_id: 304, type_id: TRITANIUM, quantity: 20 })]),
      ],
      MATERIALS
    );
    expect(stock.get(TRITANIUM)?.quantity).toBe(30);
    expect(stock.get(TRITANIUM)?.placements).toHaveLength(2);
  });

  it('gives a corp placement a distinct ownedStockLocationKey from the reading Director’s own key', () => {
    const corpPlacement = {
      characterId: 1,
      corporationId: 1,
      locationId: STATION,
      locationType: 'station' as const,
    };
    const characterPlacement = {
      characterId: 1,
      locationId: STATION,
      locationType: 'station' as const,
    };
    expect(ownedStockLocationKey(corpPlacement)).not.toBe(
      ownedStockLocationKey(characterPlacement)
    );
  });
});

describe('collectStockLocations with a corporation source (issue #798)', () => {
  it('carries corporationId through to the collected location', () => {
    const detected = detectOwnedStock(
      [corpSource(1, 500, [asset({ item_id: 310, type_id: TRITANIUM, quantity: 10 })])],
      MATERIALS
    );
    expect(collectStockLocations(detected)).toEqual([
      { characterId: 1, corporationId: 500, locationId: STATION, locationType: 'station' },
    ]);
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

describe('filterStockByScope', () => {
  function stock(): DetectedOwnedStockMap {
    return detectOwnedStock(
      [
        source(1, [
          asset({ item_id: 200, type_id: TRITANIUM, quantity: 100 }),
          asset({ item_id: 201, type_id: TRITANIUM, quantity: 250, location_id: OTHER_STATION }),
        ]),
        source(2, [asset({ item_id: 202, type_id: TRITANIUM, quantity: 700 })]),
      ],
      MATERIALS
    );
  }

  it('returns the map unchanged when scope is undefined', () => {
    const detected = stock();
    expect(filterStockByScope(detected, undefined)).toBe(detected);
  });

  it('returns the map unchanged for mode "everywhere"', () => {
    const detected = stock();
    expect(filterStockByScope(detected, { mode: 'everywhere' })).toBe(detected);
  });

  it('counts only placements at the selected locations for mode "selected"', () => {
    const filtered = filterStockByScope(stock(), {
      mode: 'selected',
      locations: [{ characterId: 1, locationId: STATION, locationType: 'station' }],
    });
    expect(filtered.get(TRITANIUM)).toEqual({
      quantity: 100,
      placements: [{ characterId: 1, locationId: STATION, locationType: 'station', quantity: 100 }],
    });
  });

  it('sums across several selected locations', () => {
    const filtered = filterStockByScope(stock(), {
      mode: 'selected',
      locations: [
        { characterId: 1, locationId: STATION, locationType: 'station' },
        { characterId: 2, locationId: STATION, locationType: 'station' },
      ],
    });
    expect(filtered.get(TRITANIUM)?.quantity).toBe(800);
    expect(filtered.get(TRITANIUM)?.placements).toHaveLength(2);
  });

  it('drops a material entirely when none of its placements match the selection', () => {
    const filtered = filterStockByScope(stock(), {
      mode: 'selected',
      locations: [{ characterId: 99, locationId: 999, locationType: 'station' }],
    });
    expect(filtered.has(TRITANIUM)).toBe(false);
  });

  it('counts nothing when the selected-location list is empty', () => {
    const filtered = filterStockByScope(stock(), { mode: 'selected', locations: [] });
    expect(filtered.size).toBe(0);
  });
});

describe('collectStockLocations', () => {
  it('returns nothing for an empty stock map', () => {
    expect(collectStockLocations(new Map())).toEqual([]);
  });

  it('dedupes one location shared by several materials', () => {
    const detected = detectOwnedStock(
      [
        source(1, [
          asset({ item_id: 210, type_id: TRITANIUM, quantity: 10 }),
          asset({ item_id: 211, type_id: PYERITE, quantity: 20 }),
        ]),
      ],
      MATERIALS
    );
    expect(collectStockLocations(detected)).toEqual([
      { characterId: 1, locationId: STATION, locationType: 'station' },
    ]);
  });

  it('lists every distinct character/location combination', () => {
    const detected = detectOwnedStock(
      [
        source(1, [
          asset({ item_id: 220, type_id: TRITANIUM, quantity: 10 }),
          asset({ item_id: 221, type_id: TRITANIUM, quantity: 5, location_id: OTHER_STATION }),
        ]),
        source(2, [asset({ item_id: 222, type_id: TRITANIUM, quantity: 7 })]),
      ],
      MATERIALS
    );
    expect(collectStockLocations(detected)).toEqual(
      expect.arrayContaining([
        { characterId: 1, locationId: STATION, locationType: 'station' },
        { characterId: 1, locationId: OTHER_STATION, locationType: 'station' },
        { characterId: 2, locationId: STATION, locationType: 'station' },
      ])
    );
    expect(collectStockLocations(detected)).toHaveLength(3);
  });
});

describe('container-level scope (issue #2869)', () => {
  const CONTAINER = 700;
  const loose = asset({ item_id: 1, type_id: TRITANIUM, quantity: 100 });
  const box = asset({ item_id: CONTAINER, type_id: 3465, is_singleton: true });
  const boxed = asset({
    item_id: 2,
    type_id: TRITANIUM,
    quantity: 900,
    location_id: CONTAINER,
    location_type: 'item',
    location_flag: 'AutoFit',
  });
  const stock = () => detectOwnedStock([source(1, [loose, box, boxed])], MATERIALS);
  const selected = (excludedContainers?: number[]) => ({
    mode: 'selected' as const,
    locations: [{ characterId: 1, locationId: STATION, locationType: 'station' as const }],
    ...(excludedContainers ? { excludedContainers } : {}),
  });

  it('keeps one placement per location and records the container breakdown', () => {
    const entry = stock().get(TRITANIUM);
    expect(entry?.quantity).toBe(1000);
    expect(entry?.placements).toHaveLength(1);
    expect(entry?.placements[0]?.containers).toEqual([
      { containerId: CONTAINER, typeId: 3465, quantity: 900 },
    ]);
  });

  it('leaves loose stacks without a container breakdown', () => {
    const entry = detectOwnedStock([source(1, [loose])], MATERIALS).get(TRITANIUM);
    expect(entry?.placements[0]?.containers).toBeUndefined();
  });

  it('drops only the excluded container from a selected location', () => {
    const filtered = filterStockByScope(stock(), selected([CONTAINER]));
    expect(filtered.get(TRITANIUM)?.quantity).toBe(100);
    expect(filtered.get(TRITANIUM)?.placements[0]?.containers).toBeUndefined();
  });

  it('removes the material when its whole holding was excluded', () => {
    const only = detectOwnedStock([source(1, [box, boxed])], MATERIALS);
    expect(filterStockByScope(only, selected([CONTAINER])).size).toBe(0);
  });

  it('is unchanged when no containers are excluded', () => {
    expect(filterStockByScope(stock(), selected()).get(TRITANIUM)?.quantity).toBe(1000);
    expect(filterStockByScope(stock(), selected([])).get(TRITANIUM)?.quantity).toBe(1000);
  });
});

describe('hangar-level scope (issue #2941)', () => {
  const OFFICE = 900;
  const CRATE = 701;
  const CORP = 5000;
  const office = asset({
    item_id: OFFICE,
    type_id: 27,
    is_singleton: true,
    location_flag: 'OfficeFolder',
  });
  const inOffice = (item_id: number, quantity: number, flag: string) =>
    asset({
      item_id,
      type_id: TRITANIUM,
      quantity,
      location_id: OFFICE,
      location_type: 'item',
      location_flag: flag,
    });
  const crate = asset({
    item_id: CRATE,
    type_id: 3465,
    is_singleton: true,
    location_id: OFFICE,
    location_type: 'item',
    location_flag: 'CorpSAG2',
  });
  const crated = asset({
    item_id: 50,
    type_id: TRITANIUM,
    quantity: 400,
    location_id: CRATE,
    location_type: 'item',
    location_flag: 'AutoFit',
  });
  const stock = () =>
    detectOwnedStock(
      [
        corpSource(1, CORP, [
          office,
          inOffice(10, 100, 'CorpSAG1'),
          inOffice(11, 200, 'CorpSAG3'),
          crate,
          crated,
        ]),
      ],
      MATERIALS
    );
  const station = {
    characterId: 1,
    corporationId: CORP,
    locationId: STATION,
    locationType: 'station' as const,
  };
  const scope = (extra: {
    locations?: (typeof station)[];
    hangars?: (typeof station & { division: number })[];
    containers?: number[];
  }) => ({ mode: 'selected' as const, locations: [], ...extra });

  it('records hangar totals and does not treat the office folder as a container', () => {
    const placement = stock().get(TRITANIUM)?.placements[0];
    expect(placement?.quantity).toBe(700);
    expect(placement?.hangars).toEqual(
      expect.arrayContaining([
        { division: 1, quantity: 100 },
        { division: 3, quantity: 200 },
        { division: 2, quantity: 400 },
      ])
    );
    expect(placement?.containers).toEqual([
      { containerId: CRATE, typeId: 3465, quantity: 400, hangar: 2 },
    ]);
  });

  it('a selected station counts every hangar and container', () => {
    expect(
      filterStockByScope(stock(), scope({ locations: [station] })).get(TRITANIUM)?.quantity
    ).toBe(700);
  });

  it('a selected hangar counts only stock inside it, siblings excluded', () => {
    const f = filterStockByScope(stock(), scope({ hangars: [{ ...station, division: 3 }] }));
    expect(f.get(TRITANIUM)?.quantity).toBe(200);
  });

  it('a hangar includes the containers inside it', () => {
    const f = filterStockByScope(stock(), scope({ hangars: [{ ...station, division: 2 }] }));
    expect(f.get(TRITANIUM)?.quantity).toBe(400);
  });

  it('a selected container counts only its stock', () => {
    const f = filterStockByScope(stock(), scope({ containers: [CRATE] }));
    expect(f.get(TRITANIUM)?.quantity).toBe(400);
  });

  it('a hangar plus its container is not double-counted', () => {
    const f = filterStockByScope(
      stock(),
      scope({ hangars: [{ ...station, division: 2 }], containers: [CRATE] })
    );
    expect(f.get(TRITANIUM)?.quantity).toBe(400);
  });

  it('drops the material when nothing selected matches', () => {
    const f = filterStockByScope(stock(), scope({ hangars: [{ ...station, division: 7 }] }));
    expect(f.size).toBe(0);
  });

  it('rows with no hangar flag stay station-level', () => {
    const plain = detectOwnedStock(
      [source(1, [asset({ item_id: 1, type_id: TRITANIUM, quantity: 50 })])],
      MATERIALS
    );
    expect(plain.get(TRITANIUM)?.placements[0]?.hangars).toBeUndefined();
    const f = filterStockByScope(
      plain,
      scope({
        locations: [{ characterId: 1, locationId: STATION, locationType: 'station' } as never],
      })
    );
    expect(f.get(TRITANIUM)?.quantity).toBe(50);
  });
});
