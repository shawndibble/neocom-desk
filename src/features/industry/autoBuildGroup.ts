import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BpcContractRow, BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import {
  tradeHubStanding,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import {
  autoBuildHere,
  maxAutoBuildDepth,
  type BuildStrategy,
} from '@/engine/industry/autoMakeOrBuy';
import { craftScope, reactionCraftEligible } from '@/engine/industry/craftScope';
import type { MakeMethod, MaterialRecipe } from '@/engine/industry/makeOrBuy';
import type { IndustryBlueprint, SkillLevels } from '@/engine/industry/types';
import { industryActivityOf } from '@/engine/industry/types';
import type { PiData } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { loadPlanSnapshots } from './planSnapshots';
import { loadPricePercentFor } from '@/features/market/pagePricePercents';
import {
  facilityContextFor,
  reactionPlanFacilityContextFor,
  autoBuildDepthContext,
  type PlanFacilityContext,
} from './planFacilityContext';
import { recipeForLookup, type RecipeCatalog } from './recipes';
import { planOwnedBlueprints, resolveMakeOrBuy } from './resolveBuildPlan';
import { communityOffersForRows, offersForRegion } from './buildPlanPricingInputs';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';

interface ResolvedMember {
  plan: BuildPlanRecord;
  blueprint: IndustryBlueprint;
  facilityContext: PlanFacilityContext;
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

export interface GroupRecipeSources extends RecipeCatalog {
  ownedBlueprints: readonly CharacterBlueprint[];
  corpOwnedBlueprints?: CorpOwnedBlueprintsState;
  assumedMe: number;
}

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

export function groupAutoBuildMaxDepth(
  plans: readonly BuildPlanRecord[],
  sources: GroupRecipeSources,
  modifiers: CharacterModifiers
): number {
  let deepest = 0;
  for (const plan of plans) {
    const member = resolveMember(plan, sources.catalog);
    if (!member) continue;
    const recipeFor = memberRecipeFor(plan, sources);
    const ctx = autoBuildDepthContext(
      member.facilityContext,
      member.reactionPlanFacilityContext,
      modifiers
    );
    deepest = Math.max(
      deepest,
      maxAutoBuildDepth(member.blueprint, plan.me, { recipeFor, ctx, runs: plan.runs })
    );
  }
  return deepest;
}

export async function applyGroupAutoBuild(
  plans: readonly BuildPlanRecord[],
  catalog: BlueprintCatalog,
  pi: PiData | null,
  ownedBlueprints: readonly CharacterBlueprint[],
  modifiers: CharacterModifiers,
  assumedMe: number,
  options: { strategy: BuildStrategy; depth: number },
  corpOwnedBlueprints?: CorpOwnedBlueprintsState,
  bpcRows: readonly BpcContractRow[] = [],
  communityRows: readonly BpcSearchRow[] = [],
  accountSkills?: ReadonlyMap<number, SkillLevels>,
  standings: TradeHubStandingsMap = new Map()
): Promise<Map<string, Set<number>>> {
  const members = plans.flatMap((plan) => {
    const member = resolveMember(plan, catalog);
    return member ? [member] : [];
  });

  const snapshots = loadPlanSnapshots(
    members,
    { catalog, pi },
    await loadPricePercentFor('industry')
  );
  const picks = new Map<string, Set<number>>();
  await Promise.all(
    members.map(async (member, index) => {
      const snapshot = await snapshots[index]!.snapshot;
      const reactionSnapshot = await snapshots[index]!.reactionSnapshot;
      const blueprintPurchaseOffersFor = await snapshots[index]!.blueprintOffers;
      const inventionMarket = await snapshots[index]!.inventionMarket;
      const hub = getTradeHub(member.plan.hubId) ?? DEFAULT_TRADE_HUB;
      const resolution = resolveMakeOrBuy(
        member.plan,
        {
          catalog,
          pi,
          ownedBlueprints,
          corpBlueprints: corpOwnedBlueprints,
          assumedMe,
          modifiers,
          standing: tradeHubStanding(standings, hub.id),
          bpcOffersFor: offersForRegion(bpcRows, hub.regionId),
          bpcLastResortOffersFor: offersForRegion(bpcRows, hub.regionId, true),
          blueprintPurchaseOffersFor,
          inventionMarket,
          communityOffersFor: communityOffersForRows(communityRows),
        },
        { snapshot, reactionSystemCostIndex: reactionSnapshot?.systemCostIndex }
      );
      if (!resolution) return;
      const { blueprint, recipeFor, ctx, me } = resolution;
      picks.set(
        member.plan.id,
        autoBuildHere(blueprint, me, {
          recipeFor,
          ctx: { ...ctx, accountSkills },
          depth: options.depth,
          runs: member.plan.runs,
          scope: craftScope(industryActivityOf(blueprint), member.plan.includeReactions ?? false),
          strategy: options.strategy,
        })
      );
    })
  );
  return picks;
}
