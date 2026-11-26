import type {
  AdjustedPrices,
  EffectiveMaterial,
  FacilityContext,
  IndustryBlueprint,
  JobFeeBreakdown,
  MaterialCostLine,
} from '@/engine/industry/types';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { splitEffectiveMaterials } from '@/engine/industry/jobSplit';
import { jobDurationSeconds } from '@/engine/industry/time';
import { estimatedItemValue, jobFee } from '@/engine/industry/jobCost';
import { sizeRuns } from '@/engine/industry/runSizing';
import { rigKindsApplyingTo } from '@/engine/industry/rigScope';

export interface SubBuild {
  typeID: number;
  runs: number;
  outputPerRun: number;
  jobRuns: number[];
  unitsMade: number;
  needed: number;
  spare: number;
  me: number;
  seconds: number;
  inputs: EffectiveMaterial[];
  jobFee: JobFeeBreakdown;
  rigs?: string[];
}

export interface SubBuildContext extends FacilityContext {
  facilityTaxPct?: number;
  systemCostIndex: number;
  regionalTaxPct?: number;
  adjustedPrices: AdjustedPrices;
  modifiers: CharacterModifiers;
}

export function planSubBuild(
  material: Pick<MaterialCostLine, 'typeID' | 'remainingQuantity'>,
  blueprint: IndustryBlueprint,
  me: number,
  ctx: SubBuildContext
): SubBuild | null {
  const needed = material.remainingQuantity;
  if (needed <= 0) return null;
  const product = blueprint.products[0];
  if (!product) return null;
  const sizing = sizeRuns(needed, product.quantity);
  if (!sizing) return null;
  const { runs, unitsMade, spare } = sizing;
  const outputPerRun = product.quantity;

  try {
    const { jobRuns, materials: inputs } = splitEffectiveMaterials(blueprint, runs, me, ctx);
    return {
      typeID: material.typeID,
      runs,
      jobRuns,
      outputPerRun,
      unitsMade,
      needed,
      spare,
      me,
      seconds: jobDurationSeconds(
        blueprint.time,
        jobRuns[0],
        0,
        ctx.modifiers,
        ctx,
        blueprint.skills,
        blueprint.rigScope
      ),
      inputs,
      jobFee: jobFee(
        estimatedItemValue(blueprint, runs, ctx.adjustedPrices),
        ctx.systemCostIndex,
        ctx.facility,
        ctx.facilityTaxPct,
        ctx.regionalTaxPct
      ),
      ...(ctx.facility.structure &&
        ctx.rigFit.some((kind) => kind !== 'none') && {
          rigs: rigKindsApplyingTo(ctx.rigFit, blueprint.rigScope),
        }),
    };
  } catch {
    return null;
  }
}
