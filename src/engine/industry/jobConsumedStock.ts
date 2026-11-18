/**
 * Materials an active job already consumed that the last assets read still
 * shows as held (issue #6386). Pure: the caller supplies jobs, the assets
 * snapshot times and blueprints; no fetch/DOM/Dexie here.
 *
 * Under-subtracting is the safe failure — the offer then stays what it was
 * before — so a job whose inputs cannot be placed subtracts nothing.
 */

import { effectiveMaterials } from '@/engine/industry/materials';
import type { FacilityContext, IndustryBlueprint } from '@/engine/industry/types';
import type { DetectedOwnedStockMap } from './ownedStock';

/** ESI activity ids whose inputs come out of the installer's stock. */
const MANUFACTURING = 1;
const REACTION = 11;

/** A job as this module needs it — structural, so the engine imports nothing from `esi`. */
export interface StockJob {
  jobId: number;
  characterId: number;
  activityId: number;
  blueprintTypeId: number;
  runs: number;
  startMs: number;
  facilityId: number;
  /** Material efficiency of the job's blueprint, resolved by the caller; ignored for a reaction, which has none. */
  me: number;
}

/** Units of one material a job consumed, at the facility it was installed in. */
export interface JobConsumption {
  jobId: number;
  characterId: number;
  facilityId: number;
  blueprintName: string;
  typeID: number;
  quantity: number;
}

/** Units actually taken out of detected stock for one job and material. */
export interface StockReduction {
  jobId: number;
  blueprintName: string;
  typeID: number;
  quantity: number;
}

/**
 * What the jobs installed after each Character's assets read consumed. A job
 * started at or before that read is already out of the assets, so it is never
 * counted; a Character with no known read time contributes nothing.
 */
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

/**
 * Takes each consumption out of the installing Character's own placement at
 * the job's facility, floored at zero. Never another location, another
 * Character or a corporation. Returns `stock` itself when nothing applies.
 */
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
