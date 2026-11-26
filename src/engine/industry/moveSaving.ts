import { jobFee } from './jobCost';
import { FACILITY_PRESETS, type JobFeeBreakdown } from './types';

export function moveSaving(
  current: JobFeeBreakdown,
  currentIndex: number,
  newIndex: number,
  toNpcStation: boolean
): number {
  if (toNpcStation) {
    const regionalTaxPct = current.eiv > 0 ? ((current.regionalTax ?? 0) / current.eiv) * 100 : 0;
    return (
      current.total -
      jobFee(current.eiv, newIndex, FACILITY_PRESETS.npcStation, undefined, regionalTaxPct).total
    );
  }
  return current.grossCost * (1 - newIndex / currentIndex);
}
