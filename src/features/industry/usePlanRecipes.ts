import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import type { craftScope } from '@/engine/industry/craftScope';
import type { BlueprintCatalog } from './blueprintCatalog';
import { planOwnedBlueprints, type CorpBlueprintSource } from './resolveBuildPlan';
import { recipeForLookup } from './recipes';

/**
 * How the plan looks up what produces a material, and which materials it may
 * mark buildable.
 */
export function usePlanRecipes(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  pi: PiData | null,
  ownedBlueprints: readonly CharacterBlueprint[],
  corpBlueprints: CorpBlueprintSource | undefined,
  assumedMe: number,
  craftScopeList: ReturnType<typeof craftScope>
) {
  // Corp-owned blueprints (issue #839) fold in only when this plan's own
  // Corp Assets toggle is on — the same rule `resolveBuildPlan` applies
  // below, through the same helper, so the picker's owned copies and the
  // recipe lookup can never disagree with what the result was priced from.
  const effectiveOwnedBlueprints = useMemo(
    () =>
      planOwnedBlueprints(
        { includeCorpAssets: plan.includeCorpAssets },
        ownedBlueprints,
        corpBlueprints
      ),
    [ownedBlueprints, plan.includeCorpAssets, corpBlueprints]
  );

  /**
   * What produces a material — general over any typeID a `buildHere` choice
   * might reach, at any depth, not only the blueprint's own materials. Recipe
   * lookup needs no live prices, so this is available even while the market
   * snapshot is still loading, which is what keeps the build control present
   * during a slow or unreachable price fetch. Kept apart from `resolved`
   * so its identity survives a runs/ME keystroke — `canBuildHere` and
   * `autoBuildMaxDepth` key on it.
   */
  const recipeFor = useMemo(
    () =>
      recipeForLookup({
        catalog,
        pi,
        ownedBlueprints: effectiveOwnedBlueprints,
        assumedMeForUnowned: assumedMe,
      }),
    [catalog, pi, effectiveOwnedBlueprints, assumedMe]
  );

  // The one place "can this be built here" is decided — `craftScopeList`
  // (issue #698) is the same answer Auto Build's own Craft Scope and the
  // recursive engine use, so the three can never disagree. General over
  // depth: a recipe input introduced by one build is exactly as buildable as
  // the plan's own materials, which is what lets a player keep drilling down
  // as many levels as the recipe tree actually has.
  const canBuildHere = useMemo(
    () =>
      (typeID: number): boolean => {
        const method = recipeFor(typeID)?.method;
        return method !== undefined && craftScopeList.includes(method);
      },
    [recipeFor, craftScopeList]
  );

  return { effectiveOwnedBlueprints, recipeFor, canBuildHere };
}
