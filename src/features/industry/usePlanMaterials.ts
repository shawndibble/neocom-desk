/**
 * Everything the Materials table and the sub-build footnote derive from the
 * resolved plan: the flattened rows, their hauled volume, what is left to
 * shop for, the make-or-buy verdicts, and the built-versus-bought totals.
 * Pure derivation from `result` — nothing here prices anything itself.
 */
import { useMemo } from 'react';
import { makeOrBuy, type MakeOrBuy, type MakeOrBuyContext } from '@/engine/industry/makeOrBuy';
import { totalVolume } from '@/engine/industry/materialVolume';
import type { HubPrices, MaterialSourcingMap } from '@/engine/industry/types';
import { volumeForType, type BlueprintCatalog } from './blueprintCatalog';
import { buyPricedLine } from './materialRow';
import type { ResolvedBuildPlan } from './resolveBuildPlan';
import {
  hasSubBuilds,
  materialTableRows,
  shoppingListMaterials,
  subBuildSeconds as computeSubBuildSeconds,
} from './subBuildPlan';
import type { DepthPrices } from './depthPriceLoader';
import type { recipeForLookup } from './recipes';

export interface UsePlanMaterialsInput {
  result: ResolvedBuildPlan['result'];
  catalog: BlueprintCatalog;
  /** The plan's Depth Prices by type, for the materials it buys. */
  depth: DepthPrices;
  materialSourcing: MaterialSourcingMap | undefined;
  materialPrices: HubPrices;
  makeOrBuyContext: MakeOrBuyContext | null;
  recipeFor: ReturnType<typeof recipeForLookup>;
}

export function usePlanMaterials({
  result,
  catalog,
  depth,
  materialSourcing,
  materialPrices,
  makeOrBuyContext,
  recipeFor,
}: UsePlanMaterialsInput) {
  /**
   * The materials table's rows: `result.materials` is already the whole
   * resolved tree — `buildVsBuy` applies every `buildHere` choice itself, at
   * whatever depth (src/engine/industry/materialResolution) — so this only
   * has to flatten it to one row per material. One computation, not two:
   * before this, a separate expansion priced the table while the Results
   * panel above priced the plan as written, and the two could disagree the
   * moment a build was toggled (docs/context/decisions, since superseded).
   */
  const visibleMaterials = useMemo(
    () => (result ? materialTableRows(result.materials) : []),
    [result]
  );

  // Same exclusion the volume column itself applies (issue #874): a built
  // row's quantity is produced here, never hauled at that typeID — its own
  // inputs already carry that volume as their own rows in this same list.
  const materialVolume = useMemo(
    () =>
      totalVolume(
        visibleMaterials.filter((material) => material.subBuilds.length === 0),
        (typeID) => volumeForType(catalog, typeID)
      ),
    [visibleMaterials, catalog]
  );

  /**
   * What the plan still has to shop for: every leaf of the resolved tree,
   * merged by type. Feeds the shopping-list copy — never the table (or its
   * export), which shows the full tree including what it's building.
   */
  const shoppingMaterials = useMemo(
    () => (result ? shoppingListMaterials(result.materials) : []),
    [result]
  );
  // A dearer walked price can flip a material to built; its walk then explains nothing here.
  const boughtDepth = useMemo(() => {
    const bought = new Set(shoppingMaterials.map((m) => m.typeID));
    return new Map([...depth].filter(([typeID]) => bought.has(typeID)));
  }, [depth, shoppingMaterials]);

  const anySubBuilds = useMemo(() => (result ? hasSubBuilds(result.materials) : false), [result]);

  /** Job time of every sub-job in the tree, summed (not wall-clock: they run side by side). */
  const subBuildTimeSeconds = useMemo(
    () => (result ? computeSubBuildSeconds(result.materials) : 0),
    [result]
  );

  /**
   * Make-or-buy verdict per material (GLOSSARY.md round 29), computed once for
   * the table and the CSV export rather than per row render. Covers every
   * row regardless of depth: a recipe input a build introduced is exactly as
   * eligible for advice — and for the build-here control itself — as one of
   * the plan's own materials.
   */
  const materialAdvice = useMemo(() => {
    const verdicts = new Map<number, MakeOrBuy>();
    if (!makeOrBuyContext) return verdicts;
    for (const material of visibleMaterials) {
      // Priced at what it would cost to buy even while it is being built
      // (`buyPricedLine`) — the verdict compares against buying, so a built
      // row's null unit price would silently withdraw the advice exactly
      // when the player is acting on it.
      const verdict = makeOrBuy(
        buyPricedLine(material, materialSourcing, materialPrices),
        recipeFor(material.typeID),
        makeOrBuyContext
      );
      if (verdict) verdicts.set(material.typeID, verdict);
    }
    return verdicts;
  }, [visibleMaterials, makeOrBuyContext, recipeFor, materialSourcing, materialPrices]);

  /** Top-level materials the player chose to build — what the sub-build footnote summarizes. */
  const builtTopLevel = useMemo(
    () => (result ? result.materials.filter((material) => material.subBuild !== undefined) : []),
    [result]
  );

  /**
   * What building the chosen material(s) actually costs — the sum of exactly
   * the `lineCost`s `result.materialCost` already added for them, so this is
   * never a second number that could drift from the totals above. Not split
   * into materials/fees: a nested build's own fee is folded proportionally
   * into its parent's `lineCost` whenever the job makes more than the parent
   * needs (EVE sizes jobs in whole runs), so a separately-summed "fees"
   * figure could disagree with what the split inside `lineCost` actually is.
   */
  const subBuildTotal = useMemo(
    () => builtTopLevel.reduce((sum, material) => sum + material.lineCost, 0),
    [builtTopLevel]
  );

  /**
   * What buying the built material(s) outright would have cost instead, for
   * the footnote's comparison — priced the same way a plain (unbuilt) row on
   * this plan is, straight off `materialPrices`/an override, no second
   * `buildVsBuy` pass. `null` when there is nothing to compare, or when any
   * of them genuinely isn't sold at this hub, rather than showing a number
   * that quietly priced the unsold one as free (the bug this replaces).
   */
  const buyInsteadTotal = useMemo(() => {
    if (builtTopLevel.length === 0) return null;
    let total = 0;
    for (const material of builtTopLevel) {
      // Through `buyPricedLine`, the same ladder the make-or-buy advice uses,
      // rather than a third hand-rolled `override ?? hub`: that one guarded
      // only `undefined`, so a NaN or negative override reached this figure
      // and was rendered as ISK. The helper range-checks.
      const { unitPrice } = buyPricedLine(material, materialSourcing, materialPrices);
      if (unitPrice === null) return null;
      total += material.remainingQuantity * unitPrice;
    }
    return total;
  }, [builtTopLevel, materialSourcing, materialPrices]);

  return {
    visibleMaterials,
    materialVolume,
    shoppingMaterials,
    boughtDepth,
    anySubBuilds,
    subBuildTimeSeconds,
    materialAdvice,
    builtTopLevel,
    subBuildTotal,
    buyInsteadTotal,
  };
}
