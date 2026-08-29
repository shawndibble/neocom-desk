/**
 * Job installation cost (EVE University wiki "Manufacturing"):
 *   total = EIV * ((systemCostIndex * structureBonus) + facilityTax% + SCC%)
 * EIV uses ME0 (unresearched) quantities x ESI adjusted prices x runs; ME does
 * not reduce the job fee. The structure job-cost bonus applies only to the
 * cost-index term. SCC surcharge fixed at 4%; NPC station tax fixed at 0.25%.
 * (Alpha clone tax ignored — app targets Omega.)
 */

import type {
  AdjustedPrices,
  FacilityPreset,
  IndustryBlueprint,
  JobFeeBreakdown,
} from '@/engine/industry/types';
import { SCC_SURCHARGE_PCT } from '@/engine/industry/types';

/** Estimated item value for the whole job. Missing adjusted prices count as 0. */
export function estimatedItemValue(
  blueprint: IndustryBlueprint,
  runs: number,
  adjustedPrices: AdjustedPrices
): number {
  const perRun = blueprint.materials.reduce(
    (sum, { typeID, quantity }) => sum + quantity * (adjustedPrices[typeID] ?? 0),
    0
  );
  return perRun * runs;
}

/** Job fee breakdown. `facilityTaxPct` defaults to the preset's defaultTaxPct. */
export function jobFee(
  eiv: number,
  systemCostIndex: number,
  facility: FacilityPreset,
  facilityTaxPct?: number
): JobFeeBreakdown {
  if (eiv < 0) throw new RangeError(`eiv must be >= 0, got ${eiv}`);
  if (systemCostIndex < 0) {
    throw new RangeError(`systemCostIndex must be >= 0, got ${systemCostIndex}`);
  }
  const taxPct = facilityTaxPct ?? facility.defaultTaxPct;
  const grossCost = eiv * systemCostIndex * (1 - facility.jobCostBonusPct / 100);
  const sccSurcharge = (eiv * SCC_SURCHARGE_PCT) / 100;
  const facilityTax = (eiv * taxPct) / 100;
  return {
    eiv,
    grossCost,
    sccSurcharge,
    facilityTax,
    total: grossCost + sccSurcharge + facilityTax,
  };
}
