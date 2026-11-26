import { useMemo } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { groupAutoBuildMaxDepth, groupCraftScope } from './autoBuildGroup';

interface UseGroupAutoBuildArgs {
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  pricingInputs: BuildPlanPricingInputs;
}

export function useGroupAutoBuild({
  plans,
  catalog,
  pi,
  ownedBlueprints,
  modifiers,
  pricingInputs,
}: UseGroupAutoBuildArgs) {
  const { assumedMe, corpBlueprints } = pricingInputs;

  const blueprintSignature = plans.map((p) => `${p.blueprintTypeID}`).join(',');
  const maxDepth = useMemo(
    () =>
      groupAutoBuildMaxDepth(
        plans,
        { catalog, pi, ownedBlueprints, corpOwnedBlueprints: corpBlueprints, assumedMe },
        modifiers
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blueprintSignature is the stable proxy for `plans`' structural identity; see comment above.
    [blueprintSignature, catalog, pi, ownedBlueprints, corpBlueprints, assumedMe, modifiers]
  );
  const scopeSignature = plans
    .map((p) => `${p.blueprintTypeID}:${p.includeReactions ?? false}`)
    .join(',');
  const scope = useMemo(
    () => groupCraftScope(plans, catalog),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeSignature is the stable proxy for `plans`' structural identity; see comment above.
    [scopeSignature, catalog]
  );
  const affectedCount = plans.filter((p) =>
    catalog.byBlueprintTypeID.has(p.blueprintTypeID)
  ).length;

  return { maxDepth, scope, affectedCount };
}
