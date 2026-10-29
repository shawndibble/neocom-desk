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

/**
 * Auto Build (issue #695) for one plan: its tree depth and the one-shot bulk
 * write, plus the toast's Undo state.
 *
 * `autoBuildMaxDepth` is the plan's actual tree depth, independent of whether
 * live prices have loaded — depth discovery never prices anything, so gating
 * it on `makeOrBuyContext` (null until `pricesReady`) would leave Apply
 * disabled during a slow price fetch for no reason. Built from
 * `reactionPlanFacilityContext`, not the price-resolved Reaction Location in
 * `makeOrBuyContext`: that one stays `undefined` until its own market
 * snapshot lands, which would understate this plan's depth for as long as
 * that fetch is in flight whenever a Reaction Location is configured.
 * `autoBuildDepthContext` is the same seam `autoBuildGroup.ts`'s per-member
 * depth walk uses.
 */
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
  // The build-here list a strategy change replaced, for the toast's Undo.
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

  /**
   * A one-shot bulk write, not a persistent policy (docs/context/decisions).
   * Fully replaces `buildHere` — re-running with different settings, or the
   * same ones again, overwrites whatever craft/buy choices were there before,
   * including hand-picked ones. Always walks this plan's whole tree
   * (`autoBuildMaxDepth`) — the single-plan control offers no depth choice.
   * Craft Scope is `craftScopeList` (issue #698) — the same answer the manual
   * toggle and the recursive engine use, so an Auto Build pass never marks a
   * material the plan itself would then ignore. Planetary is still reserved.
   */
  function applyAutoBuild(options: { strategy: BuildStrategy }) {
    if (!blueprint || !makeOrBuyContext) return;
    const picked = autoBuildHere(blueprint, resolvedMe, {
      recipeFor,
      // Account-wide (issue #1231): a material nobody on the account can
      // build is forced to buy regardless of cost — same `accountSkills` the
      // sub-build marker uses.
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
