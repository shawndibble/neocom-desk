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
    return current.total - jobFee(current.eiv, newIndex, FACILITY_PRESETS.npcStation).total;
  }
  return current.grossCost * (1 - newIndex / currentIndex);
}
