import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyGroupAutoBuild, groupAutoBuildMaxDepth, memberRecipeFor } from './autoBuildGroup';
import { loadMarketSnapshots, type MarketSnapshot } from './marketData';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { autoBuildHere } from '@/engine/industry/autoMakeOrBuy';

vi.mock('./marketData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./marketData')>();
  return { ...actual, loadMarketSnapshots: vi.fn() };
});

vi.mock('@/engine/industry/autoMakeOrBuy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/industry/autoMakeOrBuy')>();
  return { ...actual, autoBuildHere: vi.fn(actual.autoBuildHere) };
});

const mockedSnapshots = vi.mocked(loadMarketSnapshots);
const autoBuildHereSpy = vi.mocked(autoBuildHere);

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

function sourcesFor(catalog: BlueprintCatalog) {
  return { catalog, pi: null, ownedBlueprints: [], assumedMe: 0 };
}

/** A corp-owned BPO of blueprint 101 (makes 601) at ME 10. */
const CORP_BPO_101: CharacterBlueprint = {
  item_id: 9,
  type_id: 101,
  runs: -1,
  material_efficiency: 10,
  time_efficiency: 20,
  quantity: -1,
  location_id: 60003760,
  location_flag: 'Hangar',
};
const CORP = { available: true, incomplete: false, blueprints: [CORP_BPO_101] };

beforeEach(() => {
  autoBuildHereSpy.mockClear();
  mockedSnapshots.mockReset();
  mockedSnapshots.mockImplementation((requests) => requests.map(() => Promise.resolve(SNAPSHOT)));
});

describe('groupAutoBuildMaxDepth', () => {
  it('returns 0 for an empty group', () => {
    expect(groupAutoBuildMaxDepth([], sourcesFor(catalogWith([])), {})).toBe(0);
  });

  it("takes the deepest member's own tree, not the shallowest", () => {
    const catalog = catalogWith(CHAIN_CATALOG_ENTRIES);
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
    expect(groupAutoBuildMaxDepth(plans, sourcesFor(catalog), {})).toBe(2);
  });

  it('skips a plan whose blueprint no longer resolves in the catalog', () => {
    const catalog = catalogWith([]);
    const plans = [plan({ id: 'orphan', blueprintTypeID: 999 })];
    expect(groupAutoBuildMaxDepth(plans, sourcesFor(catalog), {})).toBe(0);
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

  describe('per-member owned blueprints and Reaction Location', () => {
    // 601 bought costs 95; built it takes 100 x 602 at ME 0 (100 ISK) but
    // 90 at the corp copy's ME 10 (90 ISK) — only the ME decides the verdict.
    const catalog = catalogWith(CHAIN_CATALOG_ENTRIES);
    const prices: MarketSnapshot = {
      ...SNAPSHOT,
      hubPrices: { 601: 95, 602: 1 },
      adjustedPrices: {},
    };
    const p601x100 = {
      ...p601Blueprint,
      materials: [{ typeID: 602, quantity: 100 }],
    };
    const meCatalog = catalogWith([
      entry({ blueprintTypeID: 100, blueprint: p600Blueprint, productTypeID: 600 }),
      entry({ blueprintTypeID: 101, blueprint: p601x100, productTypeID: 601 }),
    ]);

    it('memberRecipeFor counts corp copies only for a member with includeCorpAssets on', () => {
      const sources = { ...sourcesFor(catalog), corpOwnedBlueprints: CORP };
      expect(memberRecipeFor(plan({ id: 'a', includeCorpAssets: true }), sources)(601)).toEqual(
        expect.objectContaining({ me: 10 })
      );
      expect(memberRecipeFor(plan({ id: 'b' }), sources)(601)).toEqual(
        expect.objectContaining({ me: 0 })
      );
    });

    it("walks each member at its own owned-blueprint ME, folding corp copies per member's own toggle", async () => {
      mockedSnapshots.mockImplementation((requests) => requests.map(() => Promise.resolve(prices)));
      const plans = [
        plan({ id: 'corp', blueprintTypeID: 100, includeCorpAssets: true }),
        plan({ id: 'solo', blueprintTypeID: 100 }),
      ];

      const picks = await applyGroupAutoBuild(
        plans,
        meCatalog,
        null,
        [],
        {},
        0,
        { strategy: 'cost-effective', depth: 1 },
        CORP
      );

      expect(picks.get('corp')).toEqual(new Set([601]));
      expect(picks.get('solo')).toEqual(new Set());
    });

    it("prices a member's reaction nodes at its own Reaction Location, in the same batched fetch", async () => {
      const plans = [
        plan({
          id: 'r',
          blueprintTypeID: 100,
          includeReactions: true,
          reactionFacility: 'athanor',
          reactionBuildSystemId: 30002053,
        }),
        plan({ id: 'plain', blueprintTypeID: 100 }),
      ];

      await applyGroupAutoBuild(plans, catalog, null, [], {}, 0, {
        strategy: 'buy',
        depth: 1,
      });

      expect(mockedSnapshots).toHaveBeenCalledTimes(1);
      const requests = mockedSnapshots.mock.calls[0]![0];
      expect(requests.filter((r) => r.activity === 'reaction')).toEqual([
        expect.objectContaining({ costIndexSystemId: 30002053 }),
      ]);
    });
  });

  describe("each member's resolved ME (top-level Blueprint Acquisition)", () => {
    /** A personal BPO of the plan's own top-level blueprint (100) at ME 10. */
    const OWN_BPO_100: CharacterBlueprint = { ...CORP_BPO_101, item_id: 7, type_id: 100 };
    const catalog = catalogWith(CHAIN_CATALOG_ENTRIES);

    function meFor(planId: string, plans: BuildPlanRecord[]): number | undefined {
      const index = plans.findIndex((p) => p.id === planId);
      return autoBuildHereSpy.mock.calls[index]?.[1];
    }

    it('walks a member at its owned top-level blueprint ME, not the stored plan.me — same as its own page', async () => {
      const plans = [plan({ id: 'owned', blueprintTypeID: 100, me: 0 })];

      await applyGroupAutoBuild(plans, catalog, null, [OWN_BPO_100], {}, 0, {
        strategy: 'build',
        depth: 1,
      });

      expect(autoBuildHereSpy).toHaveBeenCalledTimes(1);
      expect(meFor('owned', plans)).toBe(10);
    });

    it("honours the member's own forced acquisition tier", async () => {
      const plans = [
        plan({
          id: 'forced',
          blueprintTypeID: 100,
          me: 0,
          materialSourcing: { 100: { acquisitionTierOverride: { me: 4, te: 8 } } },
        }),
      ];

      await applyGroupAutoBuild(plans, catalog, null, [], {}, 0, {
        strategy: 'build',
        depth: 1,
      });

      expect(meFor('forced', plans)).toBe(4);
    });

    it('skips a member whose prices never landed, leaving its buildHere untouched like the plan page', async () => {
      mockedSnapshots.mockImplementation((requests) =>
        requests.map(() => Promise.resolve({ ...SNAPSHOT, adjustedPrices: null }))
      );
      const plans = [plan({ id: 'unpriced', blueprintTypeID: 100 })];

      const picks = await applyGroupAutoBuild(plans, catalog, null, [], {}, 0, {
        strategy: 'build',
        depth: 1,
      });

      expect(picks.has('unpriced')).toBe(false);
    });
  });
});
