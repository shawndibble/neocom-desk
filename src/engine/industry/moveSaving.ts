import { jobFee } from './jobCost';
import { FACILITY_PRESETS, type JobFeeBreakdown } from './types';

/**
 * ISK a job fee falls by when the plan moves to a system with `newIndex`.
 * Staying on the same facility changes only the cost-index term. A move to an
 * NPC station also swaps the facility: its 0.25% tax in, any structure
 * job-cost bonus and owner tax out, so the saving can shrink or turn negative.
 */
export function moveSaving(
  current: JobFeeBreakdown,
  currentIndex: number,
  newIndex: number,
  toNpcStation: boolean
): number {
  if (toNpcStation) {
    // A nearby system is assumed to be in the same region, so it pays the same
    // regional tax (`regionalTax.ts`) and the saving is the other terms only.
    const regionalTaxPct = current.eiv > 0 ? ((current.regionalTax ?? 0) / current.eiv) * 100 : 0;
    return (
      current.total -
      jobFee(current.eiv, newIndex, FACILITY_PRESETS.npcStation, undefined, regionalTaxPct).total
    );
  }
  return current.grossCost * (1 - newIndex / currentIndex);
}
