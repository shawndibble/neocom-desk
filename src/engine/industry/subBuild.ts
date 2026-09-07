/**
 * Plans one job: "build this material instead of buying it".
 *
 * The make-or-buy marker already answers *whether* a material is worth
 * producing; this answers *what that would actually cost you to shop for*. It
 * sizes the sub-job the way EVE does — in runs, not units — and hands back the
 * inputs that job consumes.
 *
 * One level by itself, composed into arbitrary depth by
 * `src/engine/industry/materialResolution.ts`, which calls this once per
 * level and resolves each returned input the same way again (docs/context/
 * decisions — depth used to stop here, before that generalization).
 *
 * The job is sized against the material's *remaining* quantity, so units the
 * plan already records as owned are never re-manufactured.
 */

import type {
  AdjustedPrices,
  EffectiveMaterial,
  FacilityContext,
  IndustryBlueprint,
  JobFeeBreakdown,
  MaterialCostLine,
  SkillLevels,
} from '@/engine/industry/types';
import { effectiveMaterials } from '@/engine/industry/materials';
import { jobDurationSeconds } from '@/engine/industry/time';
import { estimatedItemValue, jobFee } from '@/engine/industry/jobCost';

/** A planned sub-job: what to install, and what it eats. */
export interface SubBuild {
  /** The parent material this job produces. */
  typeID: number;
  /** Jobs runs to install. Sized to cover `needed`, never fewer. */
  runs: number;
  /** Units the recipe yields per run — why `runs` is not simply `needed`. */
  outputPerRun: number;
  /** runs x outputPerRun. */
  unitsMade: number;
  /** Units the job has to cover: the parent's remaining (non-owned) quantity. */
  needed: number;
  /** unitsMade - needed. Non-zero whenever the output does not divide evenly. */
  spare: number;
  /** ME the job is quoted at — the best copy the character owns, else 0. */
  me: number;
  /**
   * Job duration. Quoted at TE 0, matching `makeOrBuy`'s manufacturing quote:
   * the recipe lookup carries the owned copy's ME but not its TE, and an
   * assumed TE would understate the wait.
   */
  seconds: number;
  /** What the whole job consumes, after ME/structure/rig, rounded once. */
  inputs: EffectiveMaterial[];
  /** The sub-job's own installation fee — a real cost of choosing to build. */
  jobFee: JobFeeBreakdown;
}

/** Where the sub-job would run, and what it costs to install there. */
export interface SubBuildContext extends FacilityContext {
  facilityTaxPct?: number;
  systemCostIndex: number;
  adjustedPrices: AdjustedPrices;
  skills: SkillLevels;
}

/**
 * Plans the job that would produce one material, or `null` when there is
 * nothing to plan: the material is fully owned, the recipe yields no product,
 * or the recipe's data is out of the engine's range. Never throws — one bad
 * blueprint must not blank a whole materials table.
 */
export function planSubBuild(
  material: Pick<MaterialCostLine, 'typeID' | 'remainingQuantity'>,
  blueprint: IndustryBlueprint,
  me: number,
  ctx: SubBuildContext
): SubBuild | null {
  const needed = material.remainingQuantity;
  if (needed <= 0) return null;
  const product = blueprint.products[0];
  if (!product || product.quantity <= 0) return null;

  const outputPerRun = product.quantity;
  const runs = Math.ceil(needed / outputPerRun);

  try {
    const inputs = effectiveMaterials(blueprint, runs, me, ctx);
    return {
      typeID: material.typeID,
      runs,
      outputPerRun,
      unitsMade: runs * outputPerRun,
      needed,
      spare: runs * outputPerRun - needed,
      me,
      seconds: jobDurationSeconds(blueprint.time, runs, 0, ctx.skills, ctx),
      inputs,
      jobFee: jobFee(
        estimatedItemValue(blueprint, runs, ctx.adjustedPrices),
        ctx.systemCostIndex,
        ctx.facility,
        ctx.facilityTaxPct
      ),
    };
  } catch {
    // The engine range-checks ME and runs. A blueprint or an owned-ME value
    // outside those bounds is bad data, not a reason to fail the table.
    return null;
  }
}
