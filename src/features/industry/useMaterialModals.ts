import { useMemo, useState } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { mineralShortfall } from '@/engine/industry/oreBuyPlan';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import { inventionQuoteFor } from './inventionSources';
import type { MarketSnapshot } from './marketData';
import { inventionPricingContextFor } from './resolveBuildPlan';
import { buildRecipe, type MaterialTableRow } from './subBuildPlan';
import type { usePlanPricing } from './usePlanPricing';

interface MaterialModalsInput {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  visibleMaterials: readonly MaterialTableRow[];
  effectiveOwnedBlueprints: readonly CharacterBlueprint[];
  ownedBlueprints: readonly CharacterBlueprint[];
  corpBlueprints: ReturnType<typeof usePlanPricing>['corpBlueprints'];
  inventionMarket: ReturnType<typeof usePlanPricing>['inventionMarket'];
  modifiers: CharacterModifiers;
  snapshot: MarketSnapshot | null;
}

export function useMaterialModals({
  plan,
  catalog,
  visibleMaterials,
  effectiveOwnedBlueprints,
  ownedBlueprints,
  corpBlueprints,
  inventionMarket,
  modifiers,
  snapshot,
}: MaterialModalsInput) {
  const [recipeTypeId, setRecipeTypeId] = useState<number | null>(null);

  const [usedByTypeId, setUsedByTypeId] = useState<number | null>(null);

  const [buyOreOpen, setBuyOreOpen] = useState(false);
  const shortfall = useMemo(() => mineralShortfall(visibleMaterials), [visibleMaterials]);
  const hasShortfall = Object.keys(shortfall.needs).length > 0;

  const [acquisitionPickerTypeId, setAcquisitionPickerTypeId] = useState<number | null>(null);
  const acquisitionPickerOwnedCopies = useMemo(
    () =>
      acquisitionPickerTypeId === null
        ? []
        : effectiveOwnedBlueprints
            .filter((b) => b.type_id === acquisitionPickerTypeId)
            .map((b) => ({ me: b.material_efficiency, te: b.time_efficiency, runs: b.runs })),
    [acquisitionPickerTypeId, effectiveOwnedBlueprints]
  );
  const acquisitionPickerInvention = useMemo(() => {
    if (acquisitionPickerTypeId === null) return null;
    const ctx = inventionPricingContextFor(
      plan,
      { catalog, inventionMarket, ownedBlueprints, corpBlueprints, modifiers },
      snapshot
    );
    const result = ctx ? inventionQuoteFor(acquisitionPickerTypeId, ctx) : null;
    return result
      ? { result, t1BlueprintName: nameForType(catalog, result.recipe.t1BlueprintTypeID) }
      : null;
  }, [
    acquisitionPickerTypeId,
    plan,
    catalog,
    inventionMarket,
    ownedBlueprints,
    corpBlueprints,
    modifiers,
    snapshot,
  ]);

  const openRecipe = useMemo(() => {
    const row = visibleMaterials.find((material) => material.typeID === recipeTypeId);
    return row ? buildRecipe(row) : null;
  }, [visibleMaterials, recipeTypeId]);

  const usedByTotal = useMemo(
    () => visibleMaterials.find((material) => material.typeID === usedByTypeId)?.quantity ?? null,
    [visibleMaterials, usedByTypeId]
  );

  return {
    setRecipeTypeId,
    usedByTotal,
    usedByTypeId,
    setUsedByTypeId,
    openRecipe,
    buyOreOpen,
    setBuyOreOpen,
    shortfall,
    hasShortfall,
    acquisitionPickerTypeId,
    setAcquisitionPickerTypeId,
    acquisitionPickerOwnedCopies,
    acquisitionPickerInvention,
  };
}
