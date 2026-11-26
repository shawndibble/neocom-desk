import type { BuildResult } from '@/engine/industry/types';
import type { useLogProductionSeed } from './useLogProductionSeed';

export function productionLogDefaults(
  jobLogSeed: ReturnType<typeof useLogProductionSeed>['jobLogSeed'],
  logRequest: number,
  result: BuildResult | null,
  productQuantity: number | null
) {
  return jobLogSeed && jobLogSeed.request === logRequest
    ? {
        quantity: jobLogSeed.quantity,
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
