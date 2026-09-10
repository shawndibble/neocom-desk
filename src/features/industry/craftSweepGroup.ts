/**
 * Craft Sweep, generalized to a Build Group (issue #696): the same one-shot
 * bulk build/buy control from #695 (`CraftSweepControl.tsx`,
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
import { autoBuildHere, maxSweepDepth, type SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeOrBuyContext, MaterialRecipe } from '@/engine/industry/makeOrBuy';
import type { IndustryBlueprint, SkillLevels } from '@/engine/industry/types';
import { industryActivityOf } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { loadMarketSnapshots } from './marketData';
import { facilityContextFor, type PlanFacilityContext } from './planFacilityContext';
import { materialPricesFor } from './priceBasis';
import { buildPlanTypeIds, recipeForLookup } from './recipes';

interface ResolvedMember {
  plan: BuildPlanRecord;
  blueprint: IndustryBlueprint;
  facilityContext: PlanFacilityContext;
}

function resolveMember(plan: BuildPlanRecord, catalog: BlueprintCatalog): ResolvedMember | null {
  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
  if (!entry) return null;
  return {
    plan,
    blueprint: toIndustryBlueprint(entry.blueprint),
    facilityContext: facilityContextFor(plan),
  };
}

/**
 * The group's Sweep Depth ceiling: the deepest level any single member's own
 * tree reaches, the same way a solo plan sizes its own control
 * (`BuildPlanDetail.tsx`'s `craftSweepMaxDepth`). Needs no live prices —
 * depth discovery never prices anything (`maxSweepDepth`'s own doc comment)
 * — so, unlike `applyGroupCraftSweep`, this never waits on a market fetch.
 * A member whose blueprint no longer resolves contributes nothing, the same
 * "skip, don't zero" policy `groupRollup.ts` applies to an unresolvable
 * member.
 */
export function groupCraftSweepMaxDepth(
  plans: readonly BuildPlanRecord[],
  catalog: BlueprintCatalog,
  recipeFor: (typeID: number) => MaterialRecipe | null,
  skills: SkillLevels
): number {
  let deepest = 0;
  for (const plan of plans) {
    const member = resolveMember(plan, catalog);
    if (!member) continue;
    const ctx: MakeOrBuyContext = {
      ...member.facilityContext,
      systemCostIndex: 0,
      adjustedPrices: {},
      materialPrices: {},
      skills,
    };
    deepest = Math.max(
      deepest,
      maxSweepDepth(member.blueprint, plan.me, { recipeFor, ctx, runs: plan.runs })
    );
  }
  return deepest;
}

/**
 * Applies one Sweep Strategy + Sweep Depth to every member independently:
 * each member is priced at its own hub/build-system (batched by hub, the
 * same `loadMarketSnapshots` union `useComparedBuildResults.ts` uses), then
 * walked with its own facility/ME/runs. Returns the picked `buildHere` set
 * per member — never writes to Dexie itself, so the caller decides how (and
 * whether) to patch each plan. A member whose blueprint no longer resolves
 * is left out of the returned map entirely, contributing nothing rather than
 * an empty set.
 */
export async function applyGroupCraftSweep(
  plans: readonly BuildPlanRecord[],
  catalog: BlueprintCatalog,
  pi: PiData | null,
  ownedBlueprints: readonly CharacterBlueprint[],
  skills: SkillLevels,
  assumedMe: number,
  options: { strategy: SweepStrategy; depth: number }
): Promise<Map<string, Set<number>>> {
  const members = plans.flatMap((plan) => {
    const member = resolveMember(plan, catalog);
    return member ? [member] : [];
  });

  const snapshots = loadMarketSnapshots(
    members.map((member) => ({
      hub: getTradeHub(member.plan.hubId) ?? DEFAULT_TRADE_HUB,
      typeIds: buildPlanTypeIds(member.blueprint, { catalog, pi }),
      costIndexSystemId: member.plan.buildSystemId,
      activity: industryActivityOf(member.blueprint),
    }))
  );

  const recipeFor = recipeForLookup({
    catalog,
    pi,
    ownedBlueprints,
    assumedMeForUnowned: assumedMe,
  });

  const picks = new Map<string, Set<number>>();
  await Promise.all(
    members.map(async (member, index) => {
      const snapshot = await snapshots[index]!;
      const ctx: MakeOrBuyContext = {
        ...member.facilityContext,
        systemCostIndex: snapshot.systemCostIndex ?? 0,
        adjustedPrices: snapshot.adjustedPrices ?? {},
        materialPrices: materialPricesFor(snapshot, member.plan.materialPriceBasis),
        skills,
      };
      picks.set(
        member.plan.id,
        autoBuildHere(member.blueprint, member.plan.me, {
          recipeFor,
          ctx,
          depth: options.depth,
          runs: member.plan.runs,
          scope: ['manufacturing'],
          strategy: options.strategy,
        })
      );
    })
  );
  return picks;
}
