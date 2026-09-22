import { describe, it, expect } from 'vitest';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult } from '@/engine/industry/types';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketSnapshot } from './marketData';
import { resolveBuildPlan, type BuildPlanSources } from './resolveBuildPlan';

function entry(
  blueprintTypeID: number,
  productTypeID: number,
  materials: { typeID: number; quantity: number }[],
  options: { activity?: 'manufacturing' | 'reaction'; productQuantity?: number } = {}
): BlueprintCatalogEntry {
  return {
    blueprintTypeID,
    blueprint: {
      name: `Blueprint ${blueprintTypeID}`,
      time: 100,
      materials,
      products: [{ typeID: productTypeID, quantity: options.productQuantity ?? 1 }],
      skills: [],
      activity: options.activity ?? 'manufacturing',
    },
    productTypeID,
    productName: `Product ${productTypeID}`,
    productNameLower: `product ${productTypeID}`,
  };
}

function catalogOf(entries: BlueprintCatalogEntry[]): BlueprintCatalog {
  return {
    entries,
    byBlueprintTypeID: new Map(entries.map((e) => [e.blueprintTypeID, e])),
    byProductTypeID: new Map(entries.map((e) => [e.productTypeID!, e])),
    typesById: {},
  };
}

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

function owned(typeID: number, runs: number, me = 10): CharacterBlueprint {
  return {
    item_id: typeID * 10 + runs,
    type_id: typeID,
    runs,
    material_efficiency: me,
    time_efficiency: 20,
    quantity: runs === -1 ? -1 : -2,
    location_id: 60003760,
    location_flag: 'Hangar',
  };
}

function snapshot(hubPrices: Record<number, number>, systemCostIndex = 0.01): MarketSnapshot {
  return {
    hubPrices,
    hubBuyPrices: {},
    hubSellVolumes: {},
    adjustedPrices: Object.fromEntries(Object.keys(hubPrices).map((id) => [id, 1])),
    systemCostIndex,
  };
}

function sources(catalog: BlueprintCatalog, overrides: Partial<BuildPlanSources> = {}) {
  return {
    catalog,
    pi: null,
    ownedBlueprints: [],
    assumedMe: 0,
    skills: {},
    bpcOffersFor: () => [],
    includeBlueprintCost: true,
    ...overrides,
  } satisfies BuildPlanSources;
}

/** Every Blueprint Acquisition row anywhere in the resolved tree for one blueprint type. */
function acquisitionRows(result: BuildResult | null, blueprintTypeID: number): ResolvedMaterial[] {
  const rows: ResolvedMaterial[] = [];
  const walk = (materials: readonly ResolvedMaterial[]) => {
    for (const m of materials) {
      if (m.typeID === blueprintTypeID && m.acquisitionTier) rows.push(m);
      if (m.subBuild) walk(m.subBuild.inputs);
    }
  };
  walk(result?.materials ?? []);
  return rows;
}

describe('resolveBuildPlan', () => {
  // Plan product 1 <- bp 100: components 300 (bp 200) and 310 (bp 210), both
  // of which consume 400 (bp 401). One owned run of bp 401 covers one branch.
  const branching = catalogOf([
    entry(100, 1, [
      { typeID: 300, quantity: 1 },
      { typeID: 310, quantity: 1 },
    ]),
    entry(200, 300, [{ typeID: 400, quantity: 1 }]),
    entry(210, 310, [{ typeID: 400, quantity: 1 }]),
    entry(401, 400, [{ typeID: 34, quantity: 1 }]),
  ]);
  const branchingPrices = snapshot({ 1: 1000, 300: 100, 310: 100, 400: 50, 34: 5 });
  const branchingPlan = plan({ buildHere: [300, 310, 400] });

  it('resolves the same owned BPC tier claim every time it is called (fresh tier pools per call)', () => {
    const src = sources(catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])]), {
      ownedBlueprints: [owned(100, 1)],
    });
    const market = { snapshot: snapshot({ 1: 1000, 34: 5, 100: 10_000 }) };

    const first = resolveBuildPlan(plan(), src, market);
    const second = resolveBuildPlan(plan(), src, market);

    // The owned BPC covers the run: an acquisition row with nothing to buy.
    for (const resolved of [first, second]) {
      expect(resolved.resolvedMe).toBe(10);
      expect(resolved.resolvedTe).toBe(20);
      expect(acquisitionRows(resolved.result, 100)).toEqual([
        expect.objectContaining({ remainingQuantity: 0 }),
      ]);
    }
    expect(second.result?.totalCost).toBe(first.result?.totalCost);
  });

  it('shares one tier pool across every node within a single resolution, so two branches never both claim the same owned copy (issue #860)', () => {
    const resolved = resolveBuildPlan(
      branchingPlan,
      sources(branching, { ownedBlueprints: [owned(401, 1)] }),
      { snapshot: branchingPrices }
    );

    const rows = acquisitionRows(resolved.result, 401);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.remainingQuantity === 0)).toHaveLength(1);
  });

  it('shares the pool between both passes only up to the top-level claim when a group result is requested', () => {
    const resolved = resolveBuildPlan(
      branchingPlan,
      sources(branching, { ownedBlueprints: [owned(401, 1)] }),
      { snapshot: branchingPrices },
      { withGroupResult: true }
    );

    // Each pass claims bp 401 on its own: neither sees the other's nested claim.
    expect(
      acquisitionRows(resolved.result, 401).filter((r) => r.remainingQuantity === 0)
    ).toHaveLength(1);
    expect(
      acquisitionRows(resolved.groupResult, 401).filter((r) => r.remainingQuantity === 0)
    ).toHaveLength(1);
  });

  it('folds corp blueprints in only when the plan itself has includeCorpAssets on', () => {
    const catalog = catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])]);
    const src = sources(catalog, {
      corpBlueprints: { available: true, blueprints: [owned(100, -1, 8)] },
    });
    const market = { snapshot: snapshot({ 1: 1000, 34: 5, 100: 10_000 }) };

    const withCorp = resolveBuildPlan(plan({ includeCorpAssets: true }), src, market);
    const withoutCorp = resolveBuildPlan(plan({ includeCorpAssets: false }), src, market);

    // An owned BPO: nothing to acquire, at the corp copy's own ME.
    expect(withCorp.resolvedMe).toBe(8);
    expect(acquisitionRows(withCorp.result, 100)).toEqual([]);
    expect(acquisitionRows(withoutCorp.result, 100)).toEqual([
      expect.objectContaining({ unitPrice: 10_000, remainingQuantity: 1 }),
    ]);
  });

  it('ignores corp blueprints the active Character cannot read, even with includeCorpAssets on', () => {
    const catalog = catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])]);
    const resolved = resolveBuildPlan(
      plan({ includeCorpAssets: true }),
      sources(catalog, {
        corpBlueprints: { available: false, blueprints: [owned(100, -1)] },
      }),
      { snapshot: snapshot({ 1: 1000, 34: 5, 100: 10_000 }) }
    );
    expect(resolved.resolvedMe).toBe(0);
    expect(acquisitionRows(resolved.result, 100)).toEqual([
      expect.objectContaining({ unitPrice: 10_000 }),
    ]);
  });

  describe('Reaction Location (issue #698)', () => {
    // Manufactured product 1 consumes 500, which only a reaction formula makes.
    const catalog = catalogOf([
      entry(100, 1, [{ typeID: 500, quantity: 100 }]),
      entry(600, 500, [{ typeID: 34, quantity: 100 }], {
        activity: 'reaction',
        productQuantity: 100,
      }),
    ]);
    const reactionPlan = plan({
      includeReactions: true,
      buildHere: [500],
      reactionFacility: 'athanor',
      reactionSecurity: 'lowsec',
    });
    const prices = snapshot({ 1: 1_000_000, 500: 5000, 34: 10_000 }, 0.01);

    function resolveAt(reactionSystemCostIndex: number | null) {
      // No blueprint cost: an unpriced acquisition row would blank the totals.
      return resolveBuildPlan(
        reactionPlan,
        sources(catalog, { includeBlueprintCost: false }),
        { snapshot: prices, reactionSystemCostIndex },
        { withGroupResult: true }
      );
    }

    it('prices the reaction sub-build at the Reaction Location cost index, in both the normal and ignore-owned-stock passes', () => {
      const cheap = resolveAt(0.01);
      const dear = resolveAt(0.5);

      expect(dear.makeOrBuyContext?.reactionFacility?.systemCostIndex).toBe(0.5);
      expect(dear.result!.totalCost).toBeGreaterThan(cheap.result!.totalCost);
      // Nothing owned, so the group pass must price exactly like the normal one.
      expect(dear.groupResult!.totalCost).toBe(dear.result!.totalCost);
      expect(cheap.groupResult!.totalCost).toBe(cheap.result!.totalCost);
    });

    it('leaves the Reaction Location unresolved until its cost index lands', () => {
      expect(resolveAt(null).makeOrBuyContext?.reactionFacility).toBeUndefined();
      expect(
        resolveBuildPlan({ ...reactionPlan, reactionFacility: undefined }, sources(catalog), {
          snapshot: prices,
          reactionSystemCostIndex: 0.5,
        }).makeOrBuyContext?.reactionFacility
      ).toBeUndefined();
    });
  });

  it('still resolves a result at zeroed prices while the snapshot is loading, with no make-or-buy context or acquisition', () => {
    const resolved = resolveBuildPlan(
      plan(),
      sources(catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])])),
      { snapshot: null }
    );
    expect(resolved.result).not.toBeNull();
    expect(resolved.makeOrBuyContext).toBeNull();
    expect(acquisitionRows(resolved.result, 100)).toEqual([]);
    expect(resolved.resolvedMe).toBe(0);
  });

  it('reports a missing blueprint instead of throwing', () => {
    const resolved = resolveBuildPlan(plan({ blueprintTypeID: 999 }), sources(catalogOf([])), {
      snapshot: null,
    });
    expect(resolved.result).toBeNull();
    expect(resolved.error).toMatch(/.+/);
  });

  it('clamps runs before sizing the top-level acquisition', () => {
    const src = sources(catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])]), {
      ownedBlueprints: [owned(100, 1)],
    });
    // Runs of 0 clamp to 1, which the one-run owned BPC covers.
    const resolved = resolveBuildPlan(plan({ runs: 0 }), src, {
      snapshot: snapshot({ 1: 1000, 34: 5, 100: 10_000 }),
    });
    expect(acquisitionRows(resolved.result, 100)).toEqual([
      expect.objectContaining({ remainingQuantity: 0 }),
    ]);
  });
});
