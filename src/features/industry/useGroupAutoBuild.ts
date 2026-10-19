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

/** What `AutoBuildControl` needs from a Build Group: tree depth, Craft Scope and blast radius. */
export function useGroupAutoBuild({
  plans,
  catalog,
  pi,
  ownedBlueprints,
  modifiers,
  pricingInputs,
}: UseGroupAutoBuildArgs) {
  // The same inputs `useComparedBuildResults` prices these members against —
  // sub-builds unowned anywhere in the group must assume the same ME that
  // hook already quotes them at.
  const { assumedMe, corpBlueprints } = pricingInputs;

  // Depth is structural — which typeIDs have a recipe — and never
  // moves with a member's runs/ME/hub/sourcing edit, so this keys on the
  // blueprints actually in play rather than on `plans` itself: `plans` gets
  // a fresh array identity from `useLiveQuery` on every keystroke in any
  // member, and `groupAutoBuildMaxDepth` walks every member's full tree —
  // exactly the O(members) tree-walk cost `resultFlattenCache` exists to
  // avoid for the rollup's own flattening.
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
  // Craft Scope's Reactions chip (issue #698): lit whenever any single member
  // is eligible, keyed on each member's own flag too, unlike the signature
  // above — depth is structural, but eligibility follows Include Reactions.
  const scopeSignature = plans
    .map((p) => `${p.blueprintTypeID}:${p.includeReactions ?? false}`)
    .join(',');
  const scope = useMemo(
    () => groupCraftScope(plans, catalog),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeSignature is the stable proxy for `plans`' structural identity; see comment above.
    [scopeSignature, catalog]
  );
  // What Apply will actually touch: `applyGroupAutoBuild` silently skips a
  // member whose blueprint no longer resolves in the catalog (the same
  // "skip, don't zero" policy the rollup itself applies to an unresolvable
  // member), so the confirmation must count survivors, not every plan in the
  // group, or it would overstate its own blast radius.
  const affectedCount = plans.filter((p) =>
    catalog.byBlueprintTypeID.has(p.blueprintTypeID)
  ).length;

  return { maxDepth, scope, affectedCount };
}
