import { describe, it, expect } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
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
  clearEveryOwned,
  ownedStockOffer,
  takeEveryOffer,
  undoOwnedStockChanges,
  type OwnedStockChange,
} from '@/engine/industry/ownedStockOffer';
import { normalizeMaterialSourcingMap } from '@/engine/industry/sourcing';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { applySourcingPatch } from './sourcingEdits';
import {
  applyToGroupOwnedStock,
  groupOwnedDifference,
  groupMaterialTypeIdKey,
  materialTypeIdKey,
  ownedStockView,
  planSourcingPatches,
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
      modifiers: NO_CHARACTER_MODIFIERS,
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

describe('ownedStockView', () => {
  const t = ((key: string) => key) as Parameters<typeof ownedStockView>[1];

  it('narrows to the owned-stock scope for "use detected"', () => {
    const elsewhere: OwnedStockPlacement = { ...placement(60), locationId: 60008494 };
    const { detection } = ownedStockView(
      {
        stock: new Map([[34, { quantity: 100, placements: [placement(40), elsewhere] }]]),
        scope: {
          mode: 'selected',
          locations: [{ characterId: 7, locationId: 60003760, locationType: 'station' }],
        },
        characterNames: new Map([[7, 'Pilot']]),
        locationNames: new Map(),
        incompleteCharacters: [],
      },
      t
    );
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
    const { detection } = ownedStockView(
      {
        stock: new Map(),
        scope: undefined,
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

// The owned-stock offer (`ownedStockOffer.ts`) through each of its two stores:
// a plan's sourcing map, written through the same `applySourcingPatch` the
// plan store folds a `sourcing` change with, and a Build Group's Group Owned
// Overlay ledger, written the way `BuildGroupPanel` commits it.
interface StoreUnderTest<S> {
  name: string;
  from: (owned: Record<number, number>) => S;
  ownedFor: (store: S) => (typeID: number) => number | undefined;
  apply: (store: S, changes: readonly OwnedStockChange[]) => S;
}

const planStore: StoreUnderTest<MaterialSourcingMap | undefined> = {
  name: 'plan sourcing',
  from: (owned) =>
    normalizeMaterialSourcingMap(
      Object.fromEntries(
        Object.entries(owned).map(([typeID, ownedQuantity]) => [typeID, { ownedQuantity }])
      )
    ),
  ownedFor: (sourcing) => (typeID) => sourcing?.[typeID]?.ownedQuantity,
  apply: (sourcing, changes) =>
    planSourcingPatches(changes).reduce(
      (next, { typeID, patch }) => applySourcingPatch(next, typeID, patch),
      sourcing
    ),
};

const groupStore: StoreUnderTest<Record<number, number>> = {
  name: 'Group Owned Overlay',
  // The overlay never holds a 0 (an empty count removes the entry), so a
  // zeroed row is simply absent there.
  from: (owned) => Object.fromEntries(Object.entries(owned).filter(([, quantity]) => quantity > 0)),
  ownedFor: (ledger) => (typeID) => ledger[typeID],
  apply: (ledger, changes) => {
    const next = { ...ledger };
    applyToGroupOwnedStock(next, changes);
    return next;
  },
};

const STORES = [planStore, groupStore] as StoreUnderTest<unknown>[];

describe.each(STORES)('owned-stock offer through $name', (store) => {
  const BLUEPRINT = 999;
  const rows = [
    { typeID: 34, quantity: 500 }, // untouched, stock short of the need
    { typeID: 35, quantity: 10 }, // zeroed by an earlier "Use none"
    { typeID: 36, quantity: 10 }, // a stale typed count
    { typeID: 37, quantity: 10 }, // already at its offer
    { typeID: 38, quantity: 10 }, // stock well beyond the need
    { typeID: 39, quantity: 10 }, // no stock detected, a typed count
    { typeID: BLUEPRINT, quantity: 1, acquisitionTier: { me: 0, te: 0 } },
  ];
  const owned = { 35: 0, 36: 3, 37: 10, 39: 7 };
  const scoped = stockOf([
    [34, 200],
    [35, 99],
    [36, 99],
    [37, 10],
    [38, 5000],
    [BLUEPRINT, 1],
  ]);
  const scopedQuantityFor = (typeID: number) => scoped.get(typeID)?.quantity ?? 0;
  const offerFor = (row: (typeof rows)[number], ownedFor: (typeID: number) => number | undefined) =>
    ownedStockOffer(row, scopedQuantityFor(row.typeID), ownedFor(row.typeID));

  it(`"Use all" is every row's offer at once: each row takes its own, and none is left offering`, () => {
    const before = store.from(owned);
    const after = store.apply(
      before,
      takeEveryOffer(rows, store.ownedFor(before), scopedQuantityFor)
    );
    for (const row of rows) {
      const offer = offerFor(row, store.ownedFor(before));
      expect(store.ownedFor(after)(row.typeID)).toBe(offer ?? store.ownedFor(before)(row.typeID));
      expect(offerFor(row, store.ownedFor(after))).toBeNull();
    }
  });

  it('Undo puts "Use all" back exactly, an empty row included', () => {
    const before = store.from(owned);
    const changes = takeEveryOffer(rows, store.ownedFor(before), scopedQuantityFor);
    const undone = store.apply(store.apply(before, changes), undoOwnedStockChanges(changes));
    expect(undone).toEqual(before);
  });

  it('"Use none" leaves nothing owned, and Undo puts it back exactly', () => {
    const before = store.from(owned);
    const changes = clearEveryOwned(rows, store.ownedFor(before));
    const cleared = store.apply(before, changes);
    for (const row of rows) expect(store.ownedFor(cleared)(row.typeID) ?? 0).toBe(0);
    expect(store.apply(cleared, undoOwnedStockChanges(changes))).toEqual(before);
  });
});

// Each store keeps its own rule for an empty count, unchanged by sharing the
// offer: a plan stores the 0 "Use none" writes, the overlay drops the entry.
describe('"Use none" in each store', () => {
  const changes = [{ typeID: 34, from: 5, to: 0 }];

  it('writes a 0 into plan sourcing', () => {
    expect(planSourcingPatches(changes)).toEqual([{ typeID: 34, patch: { ownedQuantity: 0 } }]);
  });

  it('removes the Group Owned Overlay entry', () => {
    const ledger: Record<number, number> = { 34: 5, 35: 2 };
    applyToGroupOwnedStock(ledger, changes);
    expect(ledger).toEqual({ 35: 2 });
  });
});

describe('groupOwnedDifference', () => {
  const mats = [
    { typeID: 34, name: 'Tritanium' },
    { typeID: 35, name: 'Pyerite' },
  ];
  it('is null when every count agrees, a missing count being 0 on both sides', () => {
    expect(groupOwnedDifference(mats, {}, undefined)).toBeNull();
    expect(groupOwnedDifference(mats, { 34: { ownedQuantity: 5 } }, { 34: 5 })).toBeNull();
    expect(groupOwnedDifference(mats, { 34: { ownedQuantity: 0 } }, {})).toBeNull();
  });
  it('names the material with the largest gap, ties to the lowest typeID', () => {
    expect(groupOwnedDifference(mats, { 34: { ownedQuantity: 10 } }, { 34: 4, 35: 1 })).toEqual({
      typeID: 34,
      name: 'Tritanium',
      group: 4,
      plan: 10,
    });
    expect(groupOwnedDifference(mats, { 35: { ownedQuantity: 3 } }, { 34: 3 })?.typeID).toBe(34);
  });
  it('ignores ledger entries for materials the plan does not list', () => {
    expect(groupOwnedDifference(mats, {}, { 999: 7 })).toBeNull();
  });
});
