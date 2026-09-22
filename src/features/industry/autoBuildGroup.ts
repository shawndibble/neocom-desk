/**
 * Auto Build, generalized to a Build Group (issue #696): the same one-shot
 * bulk build/buy control from #695 (`AutoBuildControl.tsx`,
 * `autoMakeOrBuy.ts`), run once per member independently. Each member's own
 * material tree is walked with its own facility/hub/security/blueprint/ME —
 * there is no single shared tree for a group the way `groupRollup.ts` merges
 * *display* totals — and only that member's own `buildHere` is ever patched.
 *
 * Lives in `features/industry`, not `src/engine`, because it fetches live
 * market data (`loadMarketSnapshots`) — the same reason `useComparedBuildResults.ts`
 * sits here instead of the engine.
 */
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import {
  autoBuildHere,
  maxAutoBuildDepth,
  type BuildStrategy,
} from '@/engine/industry/autoMakeOrBuy';
import { craftScope, reactionCraftEligible } from '@/engine/industry/craftScope';
import type { MakeMethod, MakeOrBuyContext, MaterialRecipe } from '@/engine/industry/makeOrBuy';
import type { IndustryBlueprint, SkillLevels } from '@/engine/industry/types';
import { industryActivityOf } from '@/engine/industry/types';
import type { PiData } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { loadPlanSnapshots } from './planSnapshots';
import {
  facilityContextFor,
  reactionPlanFacilityContextFor,
  autoBuildDepthContext,
  type PlanFacilityContext,
} from './planFacilityContext';
import { materialPricesFor } from './priceBasis';
import { recipeForLookup, type RecipeCatalog } from './recipes';
import { planOwnedBlueprints, reactionFacilityFor } from './resolveBuildPlan';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';

interface ResolvedMember {
  plan: BuildPlanRecord;
  blueprint: IndustryBlueprint;
  facilityContext: PlanFacilityContext;
  /** @see reactionPlanFacilityContextFor — `null` when this member has no Reaction Location configured (issue #698). */
  reactionPlanFacilityContext: PlanFacilityContext | null;
}

function resolveMember(plan: BuildPlanRecord, catalog: BlueprintCatalog): ResolvedMember | null {
  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
  if (!entry) return null;
  return {
    plan,
    blueprint: toIndustryBlueprint(entry.blueprint),
    facilityContext: facilityContextFor(plan),
    reactionPlanFacilityContext: reactionPlanFacilityContextFor(plan),
  };
}

/**
 * Craft Scope for the group's own chip row (issue #698): Manufacturing is
 * always eligible; Reactions lights up the moment any single member is
 * eligible for it (Include Reactions on, or that member's own activity is a
 * reaction) — an Auto Build pass still resolves each member's own scope
 * independently in `applyGroupAutoBuild`, this only answers whether the chip
 * should ever light up at all. Planetary stays reserved.
 */
export function groupCraftScope(
  plans: readonly BuildPlanRecord[],
  catalog: BlueprintCatalog
): MakeMethod[] {
  for (const plan of plans) {
    const member = resolveMember(plan, catalog);
    if (!member) continue;
    if (
      reactionCraftEligible(industryActivityOf(member.blueprint), plan.includeReactions ?? false)
    ) {
      return ['manufacturing', 'reaction'];
    }
  }
  return ['manufacturing'];
}

/** What a member's recipe lookup reads — the group-wide half; the member supplies its own corp toggle. */
export interface GroupRecipeSources extends RecipeCatalog {
  ownedBlueprints: readonly CharacterBlueprint[];
  corpOwnedBlueprints?: CorpOwnedBlueprintsState;
  assumedMe: number;
}

/**
 * One member's recipe lookup: personal blueprints plus, only when that
 * member's own `includeCorpAssets` is on, the corp's — the same
 * `planOwnedBlueprints` rule the member's page and the Group Rollup price
 * with, so Auto Build and its depth control see each member at the ME it is
 * priced at.
 */
export function memberRecipeFor(
  plan: Pick<BuildPlanRecord, 'includeCorpAssets'>,
  sources: GroupRecipeSources
): (typeID: number) => MaterialRecipe | null {
  return recipeForLookup({
    catalog: sources.catalog,
    pi: sources.pi,
    ownedBlueprints: planOwnedBlueprints(
      plan,
      sources.ownedBlueprints,
      sources.corpOwnedBlueprints
    ),
    assumedMeForUnowned: sources.assumedMe,
  });
}

/**
 * The group's depth ceiling: the deepest level any single member's own
 * tree reaches, the same way a solo plan sizes its own control
 * (`BuildPlanDetail.tsx`'s `autoBuildMaxDepth`). Needs no live prices —
 * depth discovery never prices anything (`maxAutoBuildDepth`'s own doc comment)
 * — so, unlike `applyGroupAutoBuild`, this never waits on a market fetch.
 * A member whose blueprint no longer resolves contributes nothing, the same
 * "skip, don't zero" policy `groupRollup.ts` applies to an unresolvable
 * member.
 */
export function groupAutoBuildMaxDepth(
  plans: readonly BuildPlanRecord[],
  sources: GroupRecipeSources,
  skills: SkillLevels
): number {
  let deepest = 0;
  for (const plan of plans) {
    const member = resolveMember(plan, sources.catalog);
    if (!member) continue;
    const recipeFor = memberRecipeFor(plan, sources);
    const ctx = autoBuildDepthContext(
      member.facilityContext,
      member.reactionPlanFacilityContext,
      skills
    );
    deepest = Math.max(
      deepest,
      maxAutoBuildDepth(member.blueprint, plan.me, { recipeFor, ctx, runs: plan.runs })
    );
  }
  return deepest;
}

/**
 * Applies one Build Strategy, at the group's own depth ceiling, to every member independently:
 * each member is priced at its own hub/build-system (batched by hub, the
 * same `loadPlanSnapshots` batch `useComparedBuildResults.ts` uses), then
 * walked with its own facility/ME/runs. Returns the picked `buildHere` set
 * per member — never writes to Dexie itself, so the caller decides how (and
 * whether) to patch each plan. A member whose blueprint no longer resolves
 * is left out of the returned map entirely, contributing nothing rather than
 * an empty set.
 *
 * Owned blueprints and the Reaction Location resolve per member through
 * `resolveBuildPlan.ts`'s own helpers — corp copies count only for a member
 * whose own `includeCorpAssets` is on, the same rule its page and the Group
 * Rollup price with.
 */
export async function applyGroupAutoBuild(
  plans: readonly BuildPlanRecord[],
  catalog: BlueprintCatalog,
  pi: PiData | null,
  ownedBlueprints: readonly CharacterBlueprint[],
  skills: SkillLevels,
  assumedMe: number,
  options: { strategy: BuildStrategy; depth: number },
  corpOwnedBlueprints?: CorpOwnedBlueprintsState
): Promise<Map<string, Set<number>>> {
  const members = plans.flatMap((plan) => {
    const member = resolveMember(plan, catalog);
    return member ? [member] : [];
  });

  const snapshots = loadPlanSnapshots(members, { catalog, pi });
  const recipeSources: GroupRecipeSources = {
    catalog,
    pi,
    ownedBlueprints,
    corpOwnedBlueprints,
    assumedMe,
  };

  const picks = new Map<string, Set<number>>();
  await Promise.all(
    members.map(async (member, index) => {
      const snapshot = await snapshots[index]!.snapshot;
      const reactionSnapshot = await snapshots[index]!.reactionSnapshot;
      const reactionFacility = reactionFacilityFor(member.plan, reactionSnapshot?.systemCostIndex);
      const recipeFor = memberRecipeFor(member.plan, recipeSources);
      const ctx: MakeOrBuyContext = {
        ...member.facilityContext,
        systemCostIndex: snapshot.systemCostIndex ?? 0,
        adjustedPrices: snapshot.adjustedPrices ?? {},
        materialPrices: materialPricesFor(snapshot, member.plan.materialPriceBasis),
        skills,
        reactionFacility,
      };
      picks.set(
        member.plan.id,
        autoBuildHere(member.blueprint, member.plan.me, {
          recipeFor,
          ctx,
          depth: options.depth,
          runs: member.plan.runs,
          scope: craftScope(
            industryActivityOf(member.blueprint),
            member.plan.includeReactions ?? false
          ),
          strategy: options.strategy,
        })
      );
    })
  );
  return picks;
}
