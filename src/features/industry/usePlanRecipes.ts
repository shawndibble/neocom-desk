import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import type { craftScope } from '@/engine/industry/craftScope';
import type { BlueprintCatalog } from './blueprintCatalog';
import { planOwnedBlueprints, type CorpBlueprintSource } from './resolveBuildPlan';
import { recipeForLookup } from './recipes';

export function usePlanRecipes(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  pi: PiData | null,
  ownedBlueprints: readonly CharacterBlueprint[],
  corpBlueprints: CorpBlueprintSource | undefined,
  assumedMe: number,
  craftScopeList: ReturnType<typeof craftScope>
) {
  const effectiveOwnedBlueprints = useMemo(
    () =>
      planOwnedBlueprints(
        { includeCorpAssets: plan.includeCorpAssets },
        ownedBlueprints,
        corpBlueprints
      ),
    [ownedBlueprints, plan.includeCorpAssets, corpBlueprints]
  );

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
