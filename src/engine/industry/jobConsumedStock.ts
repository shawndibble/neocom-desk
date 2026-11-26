import { effectiveMaterials } from '@/engine/industry/materials';
import type { FacilityContext, IndustryBlueprint } from '@/engine/industry/types';
import type { DetectedOwnedStockMap } from './ownedStock';

const MANUFACTURING = 1;
const REACTION = 11;

export interface StockJob {
  jobId: number;
  characterId: number;
  activityId: number;
  blueprintTypeId: number;
  runs: number;
  startMs: number;
  facilityId: number;
  me: number;
}

export interface JobConsumption {
  jobId: number;
  characterId: number;
  facilityId: number;
  blueprintName: string;
  typeID: number;
  quantity: number;
}

export interface StockReduction {
  jobId: number;
  blueprintName: string;
  typeID: number;
  quantity: number;
}

export function consumedByJobs(
  jobs: readonly StockJob[],
  snapshotMsByCharacter: ReadonlyMap<number, number>,
  blueprintFor: (blueprintTypeId: number) => IndustryBlueprint | undefined,
  ctx: FacilityContext
): JobConsumption[] {
  const out: JobConsumption[] = [];
  for (const job of jobs) {
    if (job.activityId !== MANUFACTURING && job.activityId !== REACTION) continue;
    const snapshotMs = snapshotMsByCharacter.get(job.characterId);
    if (snapshotMs === undefined || job.startMs <= snapshotMs) continue;
    const blueprint = blueprintFor(job.blueprintTypeId);
    if (!blueprint || job.runs < 1) continue;
    for (const material of effectiveMaterials(
      blueprint,
      job.runs,
      job.activityId === REACTION ? 0 : job.me,
      ctx
    )) {
      out.push({
        jobId: job.jobId,
        characterId: job.characterId,
        facilityId: job.facilityId,
        blueprintName: blueprint.name,
        typeID: material.typeID,
        quantity: material.quantity,
      });
    }
  }
  return out;
}

export function subtractJobConsumption(
  stock: DetectedOwnedStockMap,
  consumption: readonly JobConsumption[]
): { stock: DetectedOwnedStockMap; reductions: StockReduction[] } {
  const reductions: StockReduction[] = [];
  let next: DetectedOwnedStockMap | null = null;
  for (const c of consumption) {
    const entry = (next ?? stock).get(c.typeID);
    if (!entry) continue;
    const index = entry.placements.findIndex(
      (p) =>
        p.corporationId === undefined &&
        p.characterId === c.characterId &&
        p.locationId === c.facilityId &&
        p.quantity > 0
    );
    if (index < 0) continue;
    const placement = entry.placements[index];
    const taken = Math.min(placement.quantity, c.quantity);
    next ??= new Map(stock);
    const placements = entry.placements.flatMap((p, i) =>
      i !== index ? [p] : p.quantity - taken > 0 ? [{ ...p, quantity: p.quantity - taken }] : []
    );
    if (placements.length === 0) next.delete(c.typeID);
    else next.set(c.typeID, { quantity: entry.quantity - taken, placements });
    reductions.push({
      jobId: c.jobId,
      blueprintName: c.blueprintName,
      typeID: c.typeID,
      quantity: taken,
    });
  }
  return { stock: next ?? stock, reductions };
}
