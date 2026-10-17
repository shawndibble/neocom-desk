import { describe, it, expect } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult } from '@/engine/industry/types';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketSnapshot } from './marketData';
import { makeOrBuy } from '@/engine/industry/makeOrBuy';
import { materialRecipe } from './recipes';
import { resolveBuildPlan, resolveMakeOrBuy, type BuildPlanSources } from './resolveBuildPlan';
import type { InventionMarket } from './inventionSources';

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
    modifiers: NO_CHARACTER_MODIFIERS,
    bpcOffersFor: () => [],
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

  describe('cost index override', () => {
    const src = sources(catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])]), {
      ownedBlueprints: [owned(100, 1)],
    });
    const prices = snapshot({ 1: 1000, 34: 5 }, 0.01);

    it("prices the job fee from the plan's override instead of the snapshot's index", () => {
      const esi = resolveBuildPlan(plan(), src, { snapshot: prices }).result;
      const overridden = resolveBuildPlan(plan({ costIndexOverridePct: 10 }), src, {
        snapshot: prices,
      }).result;

      expect(overridden?.profit).toBeLessThan(esi?.profit ?? 0);
    });

    it('prices a plan whose snapshot has no index at all once an override is set', () => {
      const offline = { ...prices, systemCostIndex: null };

      expect(resolveBuildPlan(plan(), src, { snapshot: offline }).makeOrBuyContext).toBeNull();
      expect(
        resolveBuildPlan(plan({ costIndexOverridePct: 4 }), src, { snapshot: offline })
          .makeOrBuyContext
      ).not.toBeNull();
    });
  });

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
      // Both blueprints owned: an unpriced acquisition row would blank the totals.
      return resolveBuildPlan(
        reactionPlan,
        sources(catalog, { ownedBlueprints: [owned(100, -1), owned(600, -1)] }),
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

  describe('depth prices (issue #3993)', () => {
    const src = sources(catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])]), {
      ownedBlueprints: [owned(100, 1)],
    });
    const prices = { ...snapshot({ 1: 1000, 34: 5 }), hubBuyPrices: { 1: 900, 34: 4 } };

    it('costs a material at its depth price on the sell basis, leaving revenue at the lowest sell', () => {
      const top = resolveBuildPlan(plan(), src, { snapshot: prices }).result;
      const deep = resolveBuildPlan(plan(), src, {
        snapshot: prices,
        depthPrices: { 34: 7 },
      }).result;
      expect(deep?.materials.find((m) => m.typeID === 34)?.unitPrice).toBe(7);
      expect(deep?.revenue).toBe(top?.revenue);
    });

    it('ignores depth prices on the buy basis', () => {
      const resolved = resolveBuildPlan(plan({ materialPriceBasis: 'buy' }), src, {
        snapshot: prices,
        depthPrices: { 34: 7 },
      });
      expect(resolved.result?.materials.find((m) => m.typeID === 34)?.unitPrice).toBe(4);
    });

    it("keeps the pilot's own price over a depth price", () => {
      const resolved = resolveBuildPlan(
        plan({ materialSourcing: { 34: { overridePrice: 2 } } }),
        src,
        { snapshot: prices, depthPrices: { 34: 7 } }
      );
      expect(resolved.result?.materials.find((m) => m.typeID === 34)?.unitPrice).toBe(2);
    });
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

describe('invention as a blueprint source (issue #3990)', () => {
  // T2 bp 100 (product 1) is invented from T1 bp 50 (product 5): one datacore
  // at 1,000 ISK, 50% base chance, 10 runs a copy.
  const catalog = catalogOf([
    entry(50, 5, [{ typeID: 34, quantity: 10 }]),
    entry(100, 1, [{ typeID: 34, quantity: 10 }]),
  ]);
  const inventionMarket: InventionMarket = {
    recipeFor: (id) =>
      id === 100
        ? {
            t1BlueprintTypeID: 50,
            baseProbability: 0.5,
            baseRuns: 10,
            datacores: [{ typeID: 900, quantity: 1 }],
            scienceSkills: [],
            encryptionSkill: null,
          }
        : null,
    decryptors: [],
    unitPriceFor: (id) => (id === 900 ? 1_000 : null),
  };
  const market = {
    snapshot: { ...snapshot({ 1: 1000, 34: 5 }), copyingCostIndex: 0, inventionCostIndex: 0 },
  };

  it('prices a T2 plan with no owned copy end to end from an owned T1 original', () => {
    const resolved = resolveBuildPlan(
      plan(),
      sources(catalog, { ownedBlueprints: [owned(50, -1, 0)], inventionMarket }),
      market
    );
    // Each job fee: 2% × EIV 10 × (0.25% NPC tax + 4% SCC) = 0.0085.
    // Expected cost per copy = (1,000 + 2 × 0.0085) ÷ 50%.
    const [row] = acquisitionRows(resolved.result, 100);
    expect(row!.unitPrice).toBeCloseTo(2_000.034, 6);
    expect(row!.acquisitionTier).toMatchObject({ me: 2, te: 4, invented: true });
    expect(resolved.resolvedMe).toBe(2);
    expect(resolved.result!.totalCost).toBeGreaterThan(2_000);
  });

  it('offers no invention without an owned T1 original', () => {
    const resolved = resolveBuildPlan(
      plan(),
      sources(catalog, { ownedBlueprints: [owned(50, 5, 0)], inventionMarket }),
      market
    );
    const [row] = acquisitionRows(resolved.result, 100);
    expect(row!.unitPrice).toBeNull();
    expect(row!.acquisitionTier?.invented).toBeUndefined();
  });

  it('resolves an invention pick to the decryptor with its runs, though another shares its tier', () => {
    const decrypted: InventionMarket = {
      ...inventionMarket,
      decryptors: [
        { typeID: 1, name: 'Parity', probabilityMultiplier: 1.5, me: 1, te: -2, runs: 3 },
        { typeID: 2, name: 'Opt. Attainment', probabilityMultiplier: 1.9, me: 1, te: -2, runs: 2 },
      ],
      unitPriceFor: (id) => (id === 900 ? 1_000 : 100),
    };
    const resolved = resolveBuildPlan(
      plan({
        materialSourcing: {
          100: { acquisitionTierOverride: { me: 3, te: 2, invented: { runs: 13 } } },
        },
      }),
      sources(catalog, { ownedBlueprints: [owned(50, -1, 0)], inventionMarket: decrypted }),
      market
    );
    const [row] = acquisitionRows(resolved.result, 100);
    // Parity: (1,000 + 100 + 2 × 0.0085) ÷ (50% × 1.5), not the cheaper Opt. Attainment.
    expect(row!.unitPrice).toBeCloseTo(1_100.017 / 0.75, 6);
    expect(row!.acquisitionTier).toMatchObject({ me: 3, te: 2, invented: true });
  });

  it('keeps a contract pick off a cheaper invention tier at the same ME/TE', () => {
    const resolved = resolveBuildPlan(
      plan({
        materialSourcing: {
          100: { acquisitionTierOverride: { me: 2, te: 4 }, overridePrice: 5_000 },
        },
      }),
      sources(catalog, {
        ownedBlueprints: [owned(50, -1, 0)],
        inventionMarket,
        bpcOffersFor: () => [{ me: 2, te: 4, runs: 10, quantity: 1, price: 5_000 }],
      }),
      market
    );
    const [row] = acquisitionRows(resolved.result, 100);
    expect(row!.unitPrice).toBe(5_000);
    expect(row!.acquisitionTier?.invented).toBeUndefined();
  });

  it('loses to a cheaper contract copy', () => {
    const resolved = resolveBuildPlan(
      plan(),
      sources(catalog, {
        ownedBlueprints: [owned(50, -1, 0)],
        inventionMarket,
        bpcOffersFor: () => [{ me: 2, te: 4, runs: 10, quantity: 1, price: 500 }],
      }),
      market
    );
    const [row] = acquisitionRows(resolved.result, 100);
    expect(row!.unitPrice).toBe(500);
    expect(row!.acquisitionTier?.invented).toBeUndefined();
  });
});

describe('make-or-buy advice agrees with the plan it advises (blueprint cost)', () => {
  // Plan product 1 <- bp 100 needs one 300; 300 <- bp 200 from one Tritanium.
  // Materials plus fee make 300 far cheaper to build than its hub price of
  // 100 — until the bp 200 BPO (hub price 1,000) has to be bought first.
  const catalog = catalogOf([
    entry(100, 1, [{ typeID: 300, quantity: 1 }]),
    entry(200, 300, [{ typeID: 34, quantity: 1 }]),
  ]);
  const market = { snapshot: snapshot({ 1: 1000, 300: 100, 34: 5, 200: 1000 }) };

  function adviceFor(src: BuildPlanSources) {
    const bought = resolveBuildPlan(plan(), src, market);
    const built = resolveBuildPlan(plan({ buildHere: [300] }), src, market);
    const row = bought.result!.materials.find((m) => m.typeID === 300)!;
    const verdict = makeOrBuy(
      row,
      materialRecipe(300, {
        catalog,
        pi: null,
        ownedBlueprints: src.ownedBlueprints,
        assumedMeForUnowned: src.assumedMe,
      }),
      bought.makeOrBuyContext!
    );
    return {
      verdict,
      boughtCost: bought.result!.totalCost,
      builtCost: built.result!.totalCost,
    };
  }

  it('says buy when the blueprint that would have to be bought makes building dearer', () => {
    const { verdict, boughtCost, builtCost } = adviceFor(sources(catalog));
    expect(builtCost).toBeGreaterThan(boughtCost);
    expect(verdict?.verdict).toBe('buy');
    expect(verdict?.blueprintCost).toBe(1000);
  });

  it('says build when an owned BPO leaves nothing to buy', () => {
    const { verdict, boughtCost, builtCost } = adviceFor(
      sources(catalog, { ownedBlueprints: [owned(200, -1)] })
    );
    expect(builtCost).toBeLessThan(boughtCost);
    expect(verdict?.verdict).toBe('build');
    expect(verdict?.blueprintCost).toBe(0);
    expect(verdict?.me).toBe(10);
  });
});

describe('blueprint purchases are charged once per plan, not once per node', () => {
  // Same shape as `branching` above: 300 and 310 both consume one 400 (bp 401).
  const branching = catalogOf([
    entry(100, 1, [
      { typeID: 300, quantity: 1 },
      { typeID: 310, quantity: 1 },
    ]),
    entry(200, 300, [{ typeID: 400, quantity: 1 }]),
    entry(210, 310, [{ typeID: 400, quantity: 1 }]),
    entry(401, 400, [{ typeID: 34, quantity: 1 }]),
  ]);
  const ownsComponentBpos = [owned(200, -1), owned(210, -1)];
  const branchingPlan = plan({ buildHere: [300, 310, 400] });

  function chargedFor(result: BuildResult | null, blueprintTypeID: number): number {
    return acquisitionRows(result, blueprintTypeID).reduce((sum, row) => sum + row.lineCost, 0);
  }

  it('buys one BPO for two branches that both build with it', () => {
    const resolved = resolveBuildPlan(
      branchingPlan,
      sources(branching, { ownedBlueprints: ownsComponentBpos }),
      { snapshot: snapshot({ 1: 1000, 300: 100, 310: 100, 400: 50, 34: 5, 401: 1000 }) }
    );
    expect(chargedFor(resolved.result, 401)).toBe(1000);
  });

  it('spends a bought BPC’s leftover runs on the next branch before buying another', () => {
    const resolved = resolveBuildPlan(
      branchingPlan,
      sources(branching, {
        ownedBlueprints: ownsComponentBpos,
        bpcOffersFor: (id) =>
          id === 401 ? [{ me: 10, te: 20, runs: 10, quantity: 1, price: 100 }] : [],
      }),
      { snapshot: snapshot({ 1: 1000, 300: 100, 310: 100, 400: 50, 34: 5 }) }
    );
    expect(chargedFor(resolved.result, 401)).toBe(100);
  });

  it('counts BPC runs, not units, for a recipe that makes several units per run', () => {
    // 20 of 300 at 10 per run is 2 runs — one 2-run BPC, not ten of them.
    const catalog = catalogOf([
      entry(100, 1, [{ typeID: 300, quantity: 20 }]),
      entry(200, 300, [{ typeID: 34, quantity: 1 }], { productQuantity: 10 }),
    ]);
    const resolved = resolveBuildPlan(
      plan({ buildHere: [300] }),
      sources(catalog, {
        ownedBlueprints: [owned(100, -1)],
        bpcOffersFor: (id) =>
          id === 200 ? [{ me: 10, te: 20, runs: 2, quantity: 1, price: 100 }] : [],
      }),
      { snapshot: snapshot({ 1: 1000, 300: 100, 34: 5 }) }
    );
    expect(chargedFor(resolved.result, 200)).toBe(100);
  });
});

describe('resolveMakeOrBuy', () => {
  const catalog = catalogOf([entry(100, 1, [{ typeID: 34, quantity: 10 }])]);

  it('returns the same context, ME and TE the full resolution prices the plan with', () => {
    const src = sources(catalog, { ownedBlueprints: [owned(100, -1, 8)] });
    const prices = { snapshot: snapshot({ 1: 1000, 34: 5 }) };
    const full = resolveBuildPlan(plan(), src, prices);
    const verdict = resolveMakeOrBuy(plan(), src, prices);
    expect(verdict).not.toBeNull();
    expect(verdict!.me).toBe(full.resolvedMe);
    expect(verdict!.te).toBe(full.resolvedTe);
    expect(verdict!.me).toBe(8);
    expect(verdict!.ctx.systemCostIndex).toBe(full.makeOrBuyContext!.systemCostIndex);
    expect(verdict!.ctx.materialPrices).toEqual(full.materialPrices);
    expect(verdict!.blueprint.products[0]?.typeID).toBe(1);
    expect(verdict!.recipeFor(34)).toBeNull();
  });

  it('is null until live fees land, like the full resolution', () => {
    expect(resolveMakeOrBuy(plan(), sources(catalog), { snapshot: null })).toBeNull();
    expect(
      resolveMakeOrBuy(plan(), sources(catalog), {
        snapshot: { ...snapshot({ 34: 5 }), adjustedPrices: null },
      })
    ).toBeNull();
  });

  it('is null when the blueprint is missing from the catalog', () => {
    expect(
      resolveMakeOrBuy(plan({ blueprintTypeID: 999 }), sources(catalog), {
        snapshot: snapshot({ 34: 5 }),
      })
    ).toBeNull();
  });
});
