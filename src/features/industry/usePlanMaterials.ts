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
  const visibleMaterials = useMemo(
    () => (result ? materialTableRows(result.materials) : []),
    [result]
  );

  const materialVolume = useMemo(
    () =>
      totalVolume(
        visibleMaterials.filter((material) => material.subBuilds.length === 0),
        (typeID) => volumeForType(catalog, typeID)
      ),
    [visibleMaterials, catalog]
  );

  const shoppingMaterials = useMemo(
    () => (result ? shoppingListMaterials(result.materials) : []),
    [result]
  );
  const boughtDepth = useMemo(() => {
    const bought = new Set(shoppingMaterials.map((m) => m.typeID));
    return new Map([...depth].filter(([typeID]) => bought.has(typeID)));
  }, [depth, shoppingMaterials]);

  const anySubBuilds = useMemo(() => (result ? hasSubBuilds(result.materials) : false), [result]);

  const subBuildTimeSeconds = useMemo(
    () => (result ? computeSubBuildSeconds(result.materials) : 0),
    [result]
  );

  const materialAdvice = useMemo(() => {
    const verdicts = new Map<number, MakeOrBuy>();
    if (!makeOrBuyContext) return verdicts;
    for (const material of visibleMaterials) {
      const verdict = makeOrBuy(
        buyPricedLine(material, materialSourcing, materialPrices),
        recipeFor(material.typeID),
        makeOrBuyContext
      );
      if (verdict) verdicts.set(material.typeID, verdict);
    }
    return verdicts;
  }, [visibleMaterials, makeOrBuyContext, recipeFor, materialSourcing, materialPrices]);

  const builtTopLevel = useMemo(
    () => (result ? result.materials.filter((material) => material.subBuild !== undefined) : []),
    [result]
  );

  const subBuildTotal = useMemo(
    () => builtTopLevel.reduce((sum, material) => sum + material.lineCost, 0),
    [builtTopLevel]
  );

  const buyInsteadTotal = useMemo(() => {
    if (builtTopLevel.length === 0) return null;
    let total = 0;
    for (const material of builtTopLevel) {
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
