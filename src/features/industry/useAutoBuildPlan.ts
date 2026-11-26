import { useMemo, useState } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { IndustryBlueprint } from '@/engine/industry/types';
import {
  autoBuildHere,
  maxAutoBuildDepth,
  type BuildStrategy,
} from '@/engine/industry/autoMakeOrBuy';
import type { craftScope } from '@/engine/industry/craftScope';
import { autoBuildDepthContext } from './planFacilityContext';
import type { facilityContextFor, reactionPlanFacilityContextFor } from './planFacilityContext';
import type { PlanPatch } from './planPatch';
import type { recipeForLookup } from './recipes';
import type { useResolvedPlan } from './useResolvedPlan';
import type { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';

interface AutoBuildPlanInput {
  plan: BuildPlanRecord;
  blueprint: IndustryBlueprint | null;
  resolvedMe: number;
  modifiers: CharacterModifiers;
  recipeFor: ReturnType<typeof recipeForLookup>;
  facilityContext: ReturnType<typeof facilityContextFor>;
  reactionPlanFacilityContext: ReturnType<typeof reactionPlanFacilityContextFor>;
  craftScopeList: ReturnType<typeof craftScope>;
  makeOrBuyContext: ReturnType<typeof useResolvedPlan>['resolved']['makeOrBuyContext'];
  accountSkills: ReturnType<typeof useAccountSkillLevels>;
  update: (patch: PlanPatch) => void;
}

export function useAutoBuildPlan({
  plan,
  blueprint,
  resolvedMe,
  modifiers,
  recipeFor,
  facilityContext,
  reactionPlanFacilityContext,
  craftScopeList,
  makeOrBuyContext,
  accountSkills,
  update,
}: AutoBuildPlanInput) {
  const [strategyUndo, setStrategyUndo] = useState<{
    previous: number[];
    built: number;
  } | null>(null);

  const autoBuildMaxDepth = useMemo(() => {
    if (!blueprint) return 0;
    return maxAutoBuildDepth(blueprint, resolvedMe, {
      recipeFor,
      ctx: autoBuildDepthContext(facilityContext, reactionPlanFacilityContext, modifiers),
      runs: plan.runs,
    });
  }, [
    blueprint,
    resolvedMe,
    plan.runs,
    recipeFor,
    facilityContext,
    modifiers,
    reactionPlanFacilityContext,
  ]);

  function applyAutoBuild(options: { strategy: BuildStrategy }) {
    if (!blueprint || !makeOrBuyContext) return;
    const picked = autoBuildHere(blueprint, resolvedMe, {
      recipeFor,
      ctx: { ...makeOrBuyContext, accountSkills },
      depth: autoBuildMaxDepth,
      runs: plan.runs,
      scope: craftScopeList,
      strategy: options.strategy,
    });
    const previous = plan.buildHere ?? [];
    update({ buildHere: [...picked] });
    setStrategyUndo({ previous: [...previous], built: picked.size });
  }

  return { autoBuildMaxDepth, applyAutoBuild, strategyUndo, setStrategyUndo };
}
