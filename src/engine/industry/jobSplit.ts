import { effectiveMaterials } from '@/engine/industry/materials';
import type {
  EffectiveMaterial,
  FacilityContext,
  IndustryBlueprint,
} from '@/engine/industry/types';

export function splitRuns(runs: number, limit: number | undefined): number[] {
  if (limit === undefined || runs <= limit) return [runs];
  const jobs = Math.ceil(runs / limit);
  const base = Math.floor(runs / jobs);
  const extra = runs % jobs;
  return Array.from({ length: jobs }, (_, i) => (i < extra ? base + 1 : base));
}

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
