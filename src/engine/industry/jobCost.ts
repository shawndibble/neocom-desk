import type {
  AdjustedPrices,
  FacilityPreset,
  IndustryBlueprint,
  JobFeeBreakdown,
} from '@/engine/industry/types';
import { SCC_SURCHARGE_PCT } from '@/engine/industry/types';

export function estimatedItemValue(
  blueprint: Pick<IndustryBlueprint, 'materials'>,
  runs: number,
  adjustedPrices: AdjustedPrices
): number {
  const perRun = blueprint.materials.reduce(
    (sum, { typeID, quantity }) => sum + quantity * (adjustedPrices[typeID] ?? 0),
    0
  );
  return perRun * runs;
}

export function jobFee(
  eiv: number,
  systemCostIndex: number,
  facility: FacilityPreset,
  facilityTaxPct?: number,
  regionalTaxPct = 0
): JobFeeBreakdown {
  if (eiv < 0) throw new RangeError(`eiv must be >= 0, got ${eiv}`);
  if (systemCostIndex < 0) {
    throw new RangeError(`systemCostIndex must be >= 0, got ${systemCostIndex}`);
  }
  const taxPct = facilityTaxPct ?? facility.defaultTaxPct;
  const grossCost = eiv * systemCostIndex * (1 - facility.jobCostBonusPct / 100);
  const sccSurcharge = (eiv * SCC_SURCHARGE_PCT) / 100;
  const facilityTax = (eiv * taxPct) / 100;
  const regionalTax = (eiv * regionalTaxPct) / 100;
  return {
    eiv,
    grossCost,
    sccSurcharge,
    facilityTax,
    regionalTax,
    total: grossCost + sccSurcharge + facilityTax + regionalTax,
  };
}
