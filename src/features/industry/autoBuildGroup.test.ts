import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyGroupAutoBuild, groupAutoBuildMaxDepth } from './autoBuildGroup';
import { loadMarketSnapshots, type MarketSnapshot } from './marketData';
import { recipeForLookup } from './recipes';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';

vi.mock('./marketData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./marketData')>();
  return { ...actual, loadMarketSnapshots: vi.fn() };
});

const mockedSnapshots = vi.mocked(loadMarketSnapshots);

function plan(overrides: Partial<BuildPlanRecord> & { id: string }): BuildPlanRecord {
  return {
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

// A three-level chain, each level with its own blueprint in the catalog:
// 600 <- 601 <- 602 <- 603 (raw, unbuildable). blueprintTypeID 100 produces
// 600, 101 produces 601, 102 produces 602 — a plan built directly off any of
// these three sees a different amount of its own tree below it.
const p600Blueprint = {
  name: 'P600',
  time: 100,
  materials: [{ typeID: 601, quantity: 1 }],
  products: [{ typeID: 600, quantity: 1 }],
  skills: [],
  activity: 'manufacturing' as const,
};
const p601Blueprint = {
  name: 'P601',
  time: 100,
  materials: [{ typeID: 602, quantity: 1 }],
  products: [{ typeID: 601, quantity: 1 }],
  skills: [],
  activity: 'manufacturing' as const,
};
const p602Blueprint = {
  name: 'P602',
  time: 100,
  materials: [{ typeID: 603, quantity: 1 }],
  products: [{ typeID: 602, quantity: 1 }],
  skills: [],
  activity: 'manufacturing' as const,
};

function entry(
  overrides: Partial<BlueprintCatalogEntry> & { blueprintTypeID: number }
): BlueprintCatalogEntry {
  return {
    blueprint: p600Blueprint,
    productTypeID: 600,
    productName: 'Widget',
    productNameLower: 'widget',
    ...overrides,
  };
}

/** Every member's shared chain, so `recipeFor(601)`/`recipeFor(602)` resolve regardless of which plan asks. */
const CHAIN_CATALOG_ENTRIES: BlueprintCatalogEntry[] = [
  entry({ blueprintTypeID: 100, blueprint: p600Blueprint, productTypeID: 600 }),
  entry({ blueprintTypeID: 101, blueprint: p601Blueprint, productTypeID: 601 }),
  entry({ blueprintTypeID: 102, blueprint: p602Blueprint, productTypeID: 602 }),
];

function catalogWith(entries: BlueprintCatalogEntry[]): BlueprintCatalog {
  return {
    entries,
    byBlueprintTypeID: new Map(entries.map((e) => [e.blueprintTypeID, e])),
    byProductTypeID: new Map(
      entries.flatMap((e) => (e.productTypeID === null ? [] : [[e.productTypeID, e] as const]))
    ),
    typesById: {},
  };
}

const SNAPSHOT: MarketSnapshot = {
  hubPrices: {},
  hubBuyPrices: {},
  hubSellVolumes: {},
  adjustedPrices: {},
  systemCostIndex: 0.01,
};

beforeEach(() => {
  mockedSnapshots.mockReset();
  mockedSnapshots.mockImplementation((requests) => requests.map(() => Promise.resolve(SNAPSHOT)));
});

describe('groupAutoBuildMaxDepth', () => {
  it('returns 0 for an empty group', () => {
    expect(groupAutoBuildMaxDepth([], catalogWith([]), () => null, {})).toBe(0);
  });

  it("takes the deepest member's own tree, not the shallowest", () => {
    const catalog = catalogWith(CHAIN_CATALOG_ENTRIES);
    const recipeFor = recipeForLookup({ catalog, pi: null, ownedBlueprints: [] });
    // 'shallow' builds 601 directly: its own materials (602) have a recipe
    // (depth 1), but 602's own materials (603) don't, so its tree stops
    // there. 'deep' builds 600, one level higher: its own materials (601)
    // have a recipe (depth 1), and 601's own materials (602) also have one
    // (depth 2) before bottoming out at 603 the same way. Its tree is
    // strictly taller even though both share the same 602/603 floor.
    const plans = [
      plan({ id: 'shallow', blueprintTypeID: 101 }), // 601 -> 602
      plan({ id: 'deep', blueprintTypeID: 100 }), // 600 -> 601 -> 602
    ];
    expect(groupAutoBuildMaxDepth(plans, catalog, recipeFor, {})).toBe(2);
  });

  it('skips a plan whose blueprint no longer resolves in the catalog', () => {
    const catalog = catalogWith([]);
    const plans = [plan({ id: 'orphan', blueprintTypeID: 999 })];
    expect(groupAutoBuildMaxDepth(plans, catalog, () => null, {})).toBe(0);
  });
});

describe('applyGroupAutoBuild', () => {
  it("walks each member's own tree independently and returns one buildHere set per plan", async () => {
    const catalog = catalogWith(CHAIN_CATALOG_ENTRIES);
    const plans = [
      plan({ id: 'a', blueprintTypeID: 100, hubId: 'jita' }), // needs 601
      plan({ id: 'b', blueprintTypeID: 101, hubId: 'jita' }), // needs 602
    ];

    const picks = await applyGroupAutoBuild(plans, catalog, null, [], {}, 0, {
      strategy: 'build',
      depth: 1,
    });

    // Plan a's product needs 601; plan b's product needs 602 — each member's
    // own materials, never a shared tree.
    expect(picks.get('a')).toEqual(new Set([601]));
    expect(picks.get('b')).toEqual(new Set([602]));
  });

  it('omits a plan whose blueprint no longer resolves, rather than mapping it to an empty set', async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [
      plan({ id: 'a', blueprintTypeID: 100 }),
      plan({ id: 'orphan', blueprintTypeID: 999 }),
    ];

    const picks = await applyGroupAutoBuild(plans, catalog, null, [], {}, 0, {
      strategy: 'build',
      depth: 1,
    });

    expect(picks.has('a')).toBe(true);
    expect(picks.has('orphan')).toBe(false);
  });

  it('batches the price fetch by hub, one request per member', async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [
      plan({ id: 'a', blueprintTypeID: 100, hubId: 'jita' }),
      plan({ id: 'b', blueprintTypeID: 100, hubId: 'amarr' }),
    ];

    await applyGroupAutoBuild(plans, catalog, null, [], {}, 0, {
      strategy: 'buy',
      depth: 1,
    });

    expect(mockedSnapshots).toHaveBeenCalledTimes(1);
    const requests = mockedSnapshots.mock.calls[0]?.[0] ?? [];
    expect(requests.map((r) => r.hub.id)).toEqual(['jita', 'amarr']);
  });

  it("the 'buy' strategy picks nothing to build, regardless of depth", async () => {
    const catalog = catalogWith([entry({ blueprintTypeID: 100 })]);
    const plans = [plan({ id: 'a', blueprintTypeID: 100 })];

    const picks = await applyGroupAutoBuild(plans, catalog, null, [], {}, 0, {
      strategy: 'buy',
      depth: 5,
    });

    expect(picks.get('a')).toEqual(new Set());
  });
});
