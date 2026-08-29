/**
 * Wires a Build Plan record + blueprint + market data into a call to
 * src/engine/industry's buildVsBuy: clamps user-entered runs/ME/TE into the
 * engine's valid ranges (a cleared/invalid input field must never blank the
 * results panel), drops facilityTaxPct for NPC stations (their tax is fixed;
 * see FACILITY_PRESETS.npcStation.defaultTaxPct), and never throws.
 */
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type {
  AdjustedPrices,
  BuildResult,
  HubPrices,
  IndustryBlueprint,
  SkillLevels,
} from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';

export interface ComputeBuildPlanInput {
  plan: Pick<
    BuildPlanRecord,
    'runs' | 'me' | 'te' | 'facility' | 'rigLevel' | 'security' | 'facilityTaxPct'
  >;
  blueprint: IndustryBlueprint;
  /** Manufacturing system cost index; pass 0 when unavailable (gate display on pricesReady instead). */
  systemCostIndex: number;
  adjustedPrices: AdjustedPrices;
  hubPrices: HubPrices;
  skills: SkillLevels;
}

export interface ComputeBuildPlanResult {
  result: BuildResult | null;
  error: string | null;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

export function computeBuildPlan({
  plan,
  blueprint,
  systemCostIndex,
  adjustedPrices,
  hubPrices,
  skills,
}: ComputeBuildPlanInput): ComputeBuildPlanResult {
  const facility = FACILITY_PRESETS[plan.facility];
  const runs = clampInt(plan.runs, 1, 100_000);
  const me = clampInt(plan.me, 0, 10);
  const te = clampInt(plan.te, 0, 20);
  const facilityTaxPct = facility.structure ? plan.facilityTaxPct : undefined;

  try {
    const result = buildVsBuy({
      blueprint,
      runs,
      me,
      te,
      facility,
      rig: plan.rigLevel,
      security: plan.security,
      facilityTaxPct,
      systemCostIndex,
      adjustedPrices,
      hubPrices,
      skills,
    });
    return { result, error: null };
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : String(err) };
  }
}
