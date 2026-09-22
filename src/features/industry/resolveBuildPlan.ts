/**
 * Resolves one Build Plan end to end: the single place a plan record plus its
 * inputs (catalog, owned/corp blueprints, BPC Sourcing offers, market
 * snapshot, Reaction Location cost index) becomes a `BuildResult`.
 *
 * Every view that prices a plan — its own page (`BuildPlanDetail.tsx`),
 * Compare, the Industry index and every Group Rollup
 * (`useComparedBuildResults.ts`) — calls this, so the wiring can't drift
 * between them:
 *
 * - Corp blueprints fold in per plan, exactly when that plan's own
 *   `includeCorpAssets` is on (issue #839) — never one list for every plan.
 * - The Reaction Location (issue #698) is resolved from the plan's own
 *   reaction fields plus the caller's reaction cost index, and reaches the
 *   make-or-buy context, both `buildVsBuy` passes and the top-level
 *   acquisition alike.
 * - Blueprint Acquisition (issue #838) gets a fresh `BlueprintTierPools` per
 *   call. The top-level claim and every nested sub-build share it (issue
 *   #860); nothing outside one call ever does, so re-resolving the same plan
 *   (a memo re-run) never re-claims against copies an earlier pass already
 *   took.
 *
 * Pure (no fetch/DOM/Dexie) and never throws: a missing blueprint or an engine
 * error comes back as `{ result: null, error }`, same as `computeBuildPlan`,
 * which stays the engine-adapter step underneath (clamps, NPC tax, try/catch).
 */
import i18n from '@/i18n';
import type { BuildPlanRecord } from '@/db';
import { MAX_JOB_RUNS } from '@/engine/industry/types';
import type {
  BuildResult,
  HubPrices,
  ReactionFacilityContext,
  SkillLevels,
} from '@/engine/industry/types';
import type { MakeOrBuyContext } from '@/engine/industry/makeOrBuy';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { clampInt } from './clampInt';
import { computeBuildPlan } from './computeBuildPlan';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import type { MarketSnapshot } from './marketData';
import { facilityContextFor, reactionPlanFacilityContextFor } from './planFacilityContext';
import { materialPricesFor } from './priceBasis';
import {
  acquisitionForLookup,
  cloneBlueprintPools,
  recipeForLookup,
  withoutAcquisitionCost,
  type BlueprintTierPools,
  type RecipeSources,
} from './recipes';

/** The parts of `CorpOwnedBlueprintsState` resolution reads. */
export type CorpBlueprintSource = Pick<CorpOwnedBlueprintsState, 'available' | 'blueprints'>;

/** Everything a plan resolves against that is not the plan itself or its prices. */
export interface BuildPlanSources {
  catalog: BlueprintCatalog;
  /** Null while pi.json loads, or if it failed. */
  pi: PiData | null;
  /** The active Character's own blueprints. */
  ownedBlueprints: readonly CharacterBlueprint[];
  /** Folded in per plan — see `planOwnedBlueprints`. Absent reads as unavailable. */
  corpBlueprints?: CorpBlueprintSource;
  /** ME to quote an unowned sub-build at (`useAssumedMe`). */
  assumedMe: number;
  skills: SkillLevels;
  /** BPC Sourcing offers already narrowed to the plan's own Trade Hub region. */
  bpcOffersFor: (blueprintTypeID: number) => readonly BpcOffer[];
  /** `useIncludeBlueprintCost`: off still resolves each tier, but prices no acquisition line. */
  includeBlueprintCost: boolean;
}

/** The plan's prices, as fetched for its own hub/build system. */
export interface BuildPlanPrices {
  /** Null while the primary snapshot is loading — the plan still resolves, at zeroed prices. */
  snapshot: MarketSnapshot | null;
  /** The Reaction Location's own system cost index; null/absent until that fetch lands. */
  reactionSystemCostIndex?: number | null;
}

export interface ResolveBuildPlanOptions {
  /**
   * Also resolve the plan with owned-stock deduction disabled (issue #697's
   * Group Owned Overlay). Opt-in: only a Group Rollup needs it.
   */
  withGroupResult?: boolean;
}

export interface ResolvedBuildPlan {
  result: BuildResult | null;
  error: string | null;
  /** Null unless `withGroupResult` was requested and succeeded. */
  groupResult: BuildResult | null;
  groupError: string | null;
  /** The ME/TE actually priced — the top-level acquisition's tier, else the plan's own. */
  resolvedMe: number;
  resolvedTe: number;
  /**
   * Every make-or-buy verdict's pricing context. Null until adjusted prices
   * and a system cost index land: a fee-free quote would call almost
   * everything worth building.
   */
  makeOrBuyContext: MakeOrBuyContext | null;
  materialPrices: HubPrices;
}

/**
 * The blueprints a plan counts as owned: personal, plus the corp's exactly
 * when the plan's own Corp Assets toggle is on and the corp source is
 * readable. `CorporationBlueprint` mirrors `CharacterBlueprint`, so the two
 * concatenate as-is.
 */
export function planOwnedBlueprints(
  plan: Pick<BuildPlanRecord, 'includeCorpAssets'>,
  ownedBlueprints: readonly CharacterBlueprint[],
  corpBlueprints: CorpBlueprintSource | undefined
): readonly CharacterBlueprint[] {
  return (plan.includeCorpAssets ?? false) &&
    corpBlueprints?.available &&
    corpBlueprints.blueprints.length > 0
    ? [...ownedBlueprints, ...corpBlueprints.blueprints]
    : ownedBlueprints;
}

/**
 * The Reaction Location with its live cost index — `undefined` until both a
 * reaction facility is configured on the plan and its cost index has landed.
 */
export function reactionFacilityFor(
  plan: Parameters<typeof reactionPlanFacilityContextFor>[0],
  reactionSystemCostIndex: number | null | undefined
): ReactionFacilityContext | undefined {
  const location = reactionPlanFacilityContextFor(plan);
  return location && reactionSystemCostIndex != null
    ? { ...location, systemCostIndex: reactionSystemCostIndex }
    : undefined;
}

export function resolveBuildPlan(
  plan: BuildPlanRecord,
  sources: BuildPlanSources,
  prices: BuildPlanPrices,
  options: ResolveBuildPlanOptions = {}
): ResolvedBuildPlan {
  const { snapshot } = prices;
  const ownedBlueprints = planOwnedBlueprints(
    plan,
    sources.ownedBlueprints,
    sources.corpBlueprints
  );
  const recipeSources: RecipeSources = {
    catalog: sources.catalog,
    pi: sources.pi,
    ownedBlueprints,
    assumedMeForUnowned: sources.assumedMe,
    blueprintAcquisition: {
      offersFor: sources.bpcOffersFor,
      hubPrices: snapshot?.hubPrices ?? {},
      sourcing: plan.materialSourcing,
    },
  };
  const recipeFor = recipeForLookup(recipeSources);
  const materialPrices = materialPricesFor(snapshot, plan.materialPriceBasis);
  const reactionFacility = reactionFacilityFor(plan, prices.reactionSystemCostIndex);
  const makeOrBuyContext: MakeOrBuyContext | null =
    snapshot && snapshot.adjustedPrices !== null && snapshot.systemCostIndex !== null
      ? {
          ...facilityContextFor(plan),
          systemCostIndex: snapshot.systemCostIndex,
          adjustedPrices: snapshot.adjustedPrices,
          materialPrices,
          skills: sources.skills,
          reactionFacility,
        }
      : null;

  const base = {
    groupResult: null,
    groupError: null,
    makeOrBuyContext,
    materialPrices,
  };

  const catalogEntry = sources.catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
  if (!catalogEntry) {
    return {
      ...base,
      result: null,
      error: i18n.t('industry.blueprintMissing'),
      resolvedMe: plan.me,
      resolvedTe: plan.te,
    };
  }
  const blueprint = toIndustryBlueprint(catalogEntry.blueprint);

  // One pool for this whole resolution — see the module doc comment.
  const blueprintPools: BlueprintTierPools = new Map();
  const acquisitionForPool = (pools: BlueprintTierPools) => {
    const raw = acquisitionForLookup(recipeSources, pools);
    return sources.includeBlueprintCost ? raw : withoutAcquisitionCost(raw);
  };
  const acquisitionFor = acquisitionForPool(blueprintPools);

  // Gated on real prices, same as `makeOrBuyContext`: a tier resolved
  // against a zeroed snapshot would change once prices actually arrive.
  const product = blueprint.products[0];
  const topLevelAcquisition =
    product && makeOrBuyContext
      ? acquisitionFor(
          product.typeID,
          clampInt(plan.runs, 1, MAX_JOB_RUNS),
          makeOrBuyContext,
          materialPrices
        )
      : null;
  const resolvedMe = topLevelAcquisition?.me ?? plan.me;
  const resolvedTe = topLevelAcquisition?.te ?? plan.te;
  const blueprintAcquisition = topLevelAcquisition
    ? { blueprintTypeID: topLevelAcquisition.blueprintTypeID, line: topLevelAcquisition.line }
    : undefined;
  // Snapshot right after the top-level claim, before the primary pass's
  // nested resolution claims anything further — the group pass starts from
  // here, so the two passes' nested resolutions never claim from each other.
  const poolsAfterTopLevel = options.withGroupResult ? cloneBlueprintPools(blueprintPools) : null;

  const common = {
    plan: { ...plan, me: resolvedMe, te: resolvedTe },
    blueprint,
    systemCostIndex: snapshot?.systemCostIndex ?? 0,
    adjustedPrices: snapshot?.adjustedPrices ?? {},
    hubPrices: snapshot?.hubPrices ?? {},
    materialPrices,
    skills: sources.skills,
    recipeFor,
    blueprintAcquisition,
    reactionFacility,
  };
  const { result, error } = computeBuildPlan({ ...common, acquisitionFor });

  let groupResult: BuildResult | null = null;
  let groupError: string | null = null;
  if (poolsAfterTopLevel) {
    ({ result: groupResult, error: groupError } = computeBuildPlan({
      ...common,
      acquisitionFor: acquisitionForPool(poolsAfterTopLevel),
      ignoreOwnedStock: true,
    }));
  }

  return {
    ...base,
    result,
    error,
    groupResult,
    groupError,
    resolvedMe,
    resolvedTe,
  };
}
