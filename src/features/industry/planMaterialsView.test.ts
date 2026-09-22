import { describe, it, expect } from 'vitest';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import {
  detectOwnedStock,
  type DetectedOwnedStockMap,
  type OwnedStockPlacement,
} from '@/engine/industry/ownedStock';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { flattenBuildResult } from './resultFlattenCache';
import { resolveBuildPlan } from './resolveBuildPlan';
import {
  bulkUseDetected,
  bulkUseNone,
  groupMaterialTypeIdKey,
  materialTypeIdKey,
  ownedStockDetection,
  typeIdsFromKey,
} from './planMaterialsView';

function entry(
  blueprintTypeID: number,
  productTypeID: number,
  materials: { typeID: number; quantity: number }[]
): BlueprintCatalogEntry {
  return {
    blueprintTypeID,
    blueprint: {
      name: `Blueprint ${blueprintTypeID}`,
      time: 100,
      materials,
      products: [{ typeID: productTypeID, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
    productTypeID,
    productName: `Product ${productTypeID}`,
    productNameLower: `product ${productTypeID}`,
  };
}

// Ship 1 <- bp 100: 300 (component, bp 200) + 35. Component 300 <- 34
// (Tritanium) — 34 only ever appears once 300 is built.
const catalog: BlueprintCatalog = (() => {
  const entries = [
    entry(100, 1, [
      { typeID: 300, quantity: 2 },
      { typeID: 35, quantity: 10 },
    ]),
    entry(200, 300, [{ typeID: 34, quantity: 50 }]),
  ];
  return {
    entries,
    byBlueprintTypeID: new Map(entries.map((e) => [e.blueprintTypeID, e])),
    byProductTypeID: new Map(entries.map((e) => [e.productTypeID!, e])),
    typesById: {},
  };
})();

function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'p',
    characterId: 1,
    name: 'Plan',
    blueprintTypeID: 100,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

/** The whole resolved tree's table rows for one plan — what both panels read. */
function tableFor(p: BuildPlanRecord) {
  const { result } = resolveBuildPlan(
    p,
    {
      catalog,
      pi: null,
      ownedBlueprints: [],
      assumedMe: 0,
      skills: {},
      bpcOffersFor: () => [],
      includeBlueprintCost: false,
    },
    {
      snapshot: {
        hubPrices: { 1: 1000, 300: 50, 34: 1, 35: 1 },
        hubBuyPrices: {},
        hubSellVolumes: {},
        adjustedPrices: {},
        systemCostIndex: 0.01,
      },
    }
  );
  return flattenBuildResult(result!).table;
}

const placement = (quantity: number): OwnedStockPlacement => ({
  characterId: 7,
  locationId: 60003760,
  locationType: 'station',
  quantity,
});

function stockOf(entries: [number, number][]): DetectedOwnedStockMap {
  return new Map(
    entries.map(([typeID, q]) => [typeID, { quantity: q, placements: [placement(q)] }])
  );
}

describe('materialTypeIdKey', () => {
  it.each([
    { name: 'empty', rows: [], key: '' },
    {
      name: 'sorted and deduplicated',
      rows: [{ typeID: 35 }, { typeID: 34 }, { typeID: 35 }],
      key: '34,35',
    },
  ])('$name', ({ rows, key }) => {
    expect(materialTypeIdKey(rows)).toBe(key);
  });

  it('walks the whole resolved tree, not just the blueprint top level', () => {
    expect(materialTypeIdKey(tableFor(plan({ buildHere: [300] })))).toBe('34,35,300');
  });

  it('round-trips through typeIdsFromKey', () => {
    expect(typeIdsFromKey('34,35,300')).toEqual([34, 35, 300]);
    expect(typeIdsFromKey('')).toEqual([]);
  });
});

describe('groupMaterialTypeIdKey', () => {
  it("covers every row a member's resolved tree shows, including a sub-build leaf (Tritanium bug, Build Group level)", () => {
    const member = plan({ buildHere: [300] });
    const ids = typeIdsFromKey(groupMaterialTypeIdKey([member], { catalog, pi: null }));
    expect(ids).toContain(34);
    for (const row of tableFor(member)) expect(ids).toContain(row.typeID);
  });

  it('does not depend on pricing or buildHere, so a price reload never changes the scan set', () => {
    const key = groupMaterialTypeIdKey([plan()], { catalog, pi: null });
    expect(
      groupMaterialTypeIdKey([plan({ buildHere: [300], runs: 9 })], { catalog, pi: null })
    ).toBe(key);
  });

  it('skips a member whose blueprint no longer resolves', () => {
    expect(groupMaterialTypeIdKey([plan({ blueprintTypeID: 999 })], { catalog, pi: null })).toBe(
      ''
    );
  });

  it('detects owned stock for that sub-build leaf once its type id is scanned', () => {
    const member = plan({ buildHere: [300] });
    const ids = new Set(typeIdsFromKey(groupMaterialTypeIdKey([member], { catalog, pi: null })));
    const stock = detectOwnedStock(
      [
        {
          characterId: 7,
          assets: [
            {
              item_id: 1,
              type_id: 34,
              quantity: 10_714_573,
              location_id: 60003760,
              location_type: 'station',
              location_flag: 'Hangar',
              is_singleton: false,
            },
          ],
        },
      ],
      ids
    );
    expect(stock.get(34)?.quantity).toBe(10_714_573);
  });
});

describe('ownedStockDetection', () => {
  const t = ((key: string) => key) as Parameters<typeof ownedStockDetection>[1];

  it('reads galaxy-wide stock and the scoped quantity separately', () => {
    const detection = ownedStockDetection(
      {
        stock: stockOf([[34, 100]]),
        scopedStock: stockOf([[34, 40]]),
        characterNames: new Map([[7, 'Pilot']]),
        locationNames: new Map(),
        incompleteCharacters: [],
      },
      t
    );
    expect(detection.stockFor(34)?.quantity).toBe(100);
    expect(detection.scopedQuantityFor(34)).toBe(40);
    expect(detection.scopedQuantityFor(35)).toBe(0);
    expect(detection.characterNameFor(7)).toBe('Pilot');
    expect(detection.characterNameFor(8)).toBe('common.unknown');
    expect(detection.lowerBound).toBe(false);
  });

  it.each([
    { name: 'no incomplete sources', incomplete: [], corp: undefined, expected: [] },
    { name: 'an incomplete Character', incomplete: ['Alt'], corp: undefined, expected: ['Alt'] },
    {
      name: 'an incomplete corp source',
      incomplete: ['Alt'],
      corp: 'Corp',
      expected: ['Alt', 'Corp'],
    },
  ])('lower bound: $name', ({ incomplete, corp, expected }) => {
    const detection = ownedStockDetection(
      {
        stock: new Map(),
        scopedStock: new Map(),
        characterNames: new Map(),
        locationNames: new Map(),
        incompleteCharacters: incomplete,
        incompleteCorporation: corp,
      },
      t
    );
    expect(detection.incompleteCharacters).toEqual(expected);
    expect(detection.lowerBound).toBe(expected.length > 0);
  });
});

describe('bulk owned-stock patches', () => {
  const rows = [
    { typeID: 34, quantity: 500 },
    { typeID: 35, quantity: 10 },
    { typeID: 36, quantity: 10 },
    { typeID: 37, quantity: 10 },
  ];

  it.each([
    {
      name: 'fills untouched rows, capped at what the row needs',
      owned: {} as Record<number, number>,
      expected: [
        { typeID: 34, ownedQuantity: 200 },
        { typeID: 35, ownedQuantity: 10 },
      ],
    },
    {
      name: 'never overwrites a typed value, including a deliberate 0',
      owned: { 34: 0, 35: 3 } as Record<number, number>,
      expected: [],
    },
  ])('use all: $name', ({ owned, expected }) => {
    const stock = stockOf([
      [34, 200],
      [35, 99],
    ]);
    expect(bulkUseDetected(rows, (id) => owned[id], stock)).toEqual(expected);
  });

  it('use none zeroes every non-zero row, typed or bulk-filled, and nothing else', () => {
    const owned: Record<number, number> = { 34: 5, 35: 0, 36: 12 };
    expect(bulkUseNone(rows, (id) => owned[id])).toEqual([
      { typeID: 34, ownedQuantity: 0 },
      { typeID: 36, ownedQuantity: 0 },
    ]);
  });
});
