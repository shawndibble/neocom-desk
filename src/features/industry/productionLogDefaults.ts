import type { BuildResult } from '@/engine/industry/types';
import type { useLogProductionSeed } from './useLogProductionSeed';

/**
 * What the Production Runs panel's "Log Production" opens with: the job's
 * own numbers when one was carried from Active Jobs, else the plan's live
 * estimate, else nothing until the plan is priced.
 */
export function productionLogDefaults(
  jobLogSeed: ReturnType<typeof useLogProductionSeed>['jobLogSeed'],
  logRequest: number,
  result: BuildResult | null,
  productQuantity: number | null
) {
  return jobLogSeed && jobLogSeed.request === logRequest
    ? {
        quantity: jobLogSeed.quantity,
        // The job seed only speaks to quantity and job fee — material
        // cost is a plan-level estimate, not something a job carries,
        // so it still comes from the plan's own live result where
        // that's ready (falling back to 0 only until pricing is).
        materialCost: result?.materialCost ?? 0,
        jobFee: jobLogSeed.jobFee,
        sourceJobId: jobLogSeed.jobId,
      }
    : result
      ? {
          quantity: productQuantity ?? 0,
          materialCost: result.materialCost,
          jobFee: result.jobFee.total,
        }
      : null;
}
