import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { ME_MAX, TE_MAX } from '@/engine/industry/efficiency';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { withoutOwnedQuantities } from '@/engine/industry/materialResolution';
import { FACILITY_PRESETS, MAX_JOB_RUNS, resolveRigFit } from '@/engine/industry/types';
import type {
  AcquisitionResolution,
  AdjustedPrices,
  BuildResult,
  HubPrices,
  IndustryBlueprint,
  ReactionFacilityContext,
} from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { SubBuildContext } from '@/engine/industry/subBuild';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import type { BuildPlanRecord } from '@/db';
import { clampInt } from './clampInt';

export interface ComputeBuildPlanInput {
  plan: Pick<
    BuildPlanRecord,
    | 'runs'
    | 'me'
    | 'te'
    | 'facility'
    | 'rigFit'
    | 'rigLevel'
    | 'security'
    | 'facilityTaxPct'
    | 'materialSourcing'
    | 'buildHere'
  >;
  blueprint: IndustryBlueprint;
  systemCostIndex: number;
  regionalTaxPct?: number;
  adjustedPrices: AdjustedPrices;
  hubPrices: HubPrices;
  materialPrices?: HubPrices;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  recipeFor?: (typeID: number) => MaterialRecipe | null;
  acquisitionFor?: (
    productTypeID: number,
    needed: number,
    ctx: SubBuildContext,
    materialPrices: HubPrices
  ) => AcquisitionResolution | null;
  blueprintAcquisition?: {
    blueprintTypeID: number;
    line: AcquisitionResolution['line'];
  };
  ignoreOwnedStock?: boolean;
  reactionFacility?: ReactionFacilityContext;
}

export interface ComputeBuildPlanResult {
  result: BuildResult | null;
  error: string | null;
}

export function computeBuildPlan({
  plan,
  blueprint,
  systemCostIndex,
  regionalTaxPct,
  adjustedPrices,
  hubPrices,
  materialPrices,
  modifiers,
  standing,
  recipeFor,
  acquisitionFor,
  blueprintAcquisition,
  ignoreOwnedStock,
  reactionFacility,
}: ComputeBuildPlanInput): ComputeBuildPlanResult {
  const facility = FACILITY_PRESETS[plan.facility];
  const runs = clampInt(plan.runs, 1, MAX_JOB_RUNS);
  const isReaction = blueprint.activity === 'reaction';
  const me = isReaction ? 0 : clampInt(plan.me, 0, ME_MAX);
  const te = isReaction ? 0 : clampInt(plan.te, 0, TE_MAX);
  const facilityTaxPct = facility.structure ? plan.facilityTaxPct : undefined;

  try {
    const result = buildVsBuy({
      blueprint,
      runs,
      me,
      te,
      facility,
      rigFit: resolveRigFit(plan),
      security: plan.security,
      facilityTaxPct,
      systemCostIndex,
      regionalTaxPct: isReaction ? undefined : regionalTaxPct,
      adjustedPrices,
      hubPrices,
      materialPrices,
      materialSourcing: ignoreOwnedStock
        ? withoutOwnedQuantities(plan.materialSourcing)
        : plan.materialSourcing,
      modifiers,
      standing,
      buildHere: plan.buildHere,
      recipeFor,
      acquisitionFor,
      blueprintAcquisition,
      reactionFacility,
    });
    return { result, error: null };
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : String(err) };
  }
}
