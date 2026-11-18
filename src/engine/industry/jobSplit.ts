/**
 * A blueprint's max production limit caps the runs one job may be installed
 * for (issue #6393). A node whose runs exceed it is built as several jobs, so
 * materials are rounded per job (ME rounding is per job) and the jobs run in
 * parallel. The job fee needs no per-job pricing: EIV is linear in runs, so
 * the fees of the split jobs sum to the fee of one job at the total runs.
 */
import { effectiveMaterials } from '@/engine/industry/materials';
import type {
  EffectiveMaterial,
  FacilityContext,
  IndustryBlueprint,
} from '@/engine/industry/types';

/**
 * Runs per job: the fewest jobs the limit allows, spread as evenly as possible
 * (90 at 40 is 30/30/30, not 40/40/10) so ME rounding and duration stay
 * balanced. The remainder goes to the first jobs, so the list is largest
 * first. No limit, or runs within it, is one job.
 */
export function splitRuns(runs: number, limit: number | undefined): number[] {
  if (limit === undefined || runs <= limit) return [runs];
  const jobs = Math.ceil(runs / limit);
  const base = Math.floor(runs / jobs);
  const extra = runs % jobs;
  return Array.from({ length: jobs }, (_, i) => (i < extra ? base + 1 : base));
}

/** The blueprint's materials for `runs`, rounded per job and summed over the split jobs. */
export function splitEffectiveMaterials(
  blueprint: IndustryBlueprint,
  runs: number,
  me: number,
  ctx: FacilityContext
): { jobRuns: number[]; materials: EffectiveMaterial[] } {
  const jobRuns = splitRuns(runs, blueprint.maxProductionLimit);
  if (jobRuns.length === 1)
    return { jobRuns, materials: effectiveMaterials(blueprint, runs, me, ctx) };
  const totals = new Map<number, EffectiveMaterial>();
  for (const job of jobRuns) {
    for (const m of effectiveMaterials(blueprint, job, me, ctx)) {
      const total = totals.get(m.typeID);
      if (total) {
        total.baseQuantity += m.baseQuantity;
        total.quantity += m.quantity;
      } else {
        totals.set(m.typeID, { ...m });
      }
    }
  }
  return { jobRuns, materials: [...totals.values()] };
}
