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

/**
 * Which of the Materials table's three dialogs is open, and what each one
 * shows: the recipe behind a built row, "Buy ore instead", and a Blueprint
 * Acquisition row's picker/override.
 */
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
  /**
   * The recipe behind whichever built row's "Build it" is open — the runs and
   * ingredient list the flat table no longer nests (`subBuildPlan`). Held as
   * a typeID rather than the recipe itself so a re-priced or re-toggled plan
   * refreshes what the modal shows instead of freezing the numbers it opened
   * with; a typeID that is no longer built simply resolves to `null`, which
   * is also how the modal closes when its row stops being built underneath it.
   */
  const [recipeTypeId, setRecipeTypeId] = useState<number | null>(null);

  /** "Buy ore instead", offered only while the plan still buys a mineral. */
  const [buyOreOpen, setBuyOreOpen] = useState(false);
  const shortfall = useMemo(() => mineralShortfall(visibleMaterials), [visibleMaterials]);
  const hasShortfall = Object.keys(shortfall.needs).length > 0;

  /** Which Blueprint Acquisition row's picker/override modal (issue #839) is open, if any. */
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
  // The Invent section's numbers, priced exactly as automatic selection
  // priced the blueprint (issue #3990).
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

  return {
    setRecipeTypeId,
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
