/// <reference lib="webworker" />
/**
 * The module browser's whole-catalogue hull check, off the main thread
 * (`hullFitService`). It loads its own copy of the dogma engine through the
 * same seam the page uses (ADR 0016) — from the Cache Storage the page has
 * already filled, so that is a read, not a download — then answers one hull
 * at a time. A newer request supersedes the one running: the run yields
 * between batches, sees it, and stops.
 */
import { packCheck } from '@/engine/fittings/hullFitKey';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { checkHullCandidate, hullRacks, loadDogmaEngine } from './dogmaFittingEngine';

export interface HullFitRequest {
  id: number;
  shipTypeId: number;
  jobs: [CandidateRack, number[]][];
  skillLevels: [number, number][];
}

export type HullFitReply =
  | { id: number; entries: [number, number][] }
  | { id: number; aborted: true }
  | { id: number; error: string };

/** Items per turn of the worker's own event loop, so a newer request is heard. */
const BATCH = 100;

const yieldToQueue = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Answers one request. `isLatest` says whether it is still the newest one
 * asked; checked between batches, so a newer request ends this one early.
 */
export async function runHullFit(
  { id, shipTypeId, jobs, skillLevels }: HullFitRequest,
  isLatest: (id: number) => boolean
): Promise<HullFitReply> {
  await loadDogmaEngine();
  const skills = new Map(skillLevels);
  const racks = hullRacks(shipTypeId, skills);
  const entries: [number, number][] = [];
  const noRackAtAll = packCheck({ fitsHull: false, canFly: false, fitsResources: false });
  for (const [rack, typeIds] of jobs) {
    if (!racks.has(rack)) {
      // A rack the hull has no slot in at all can only ever fail the hull's
      // rules (`racksWithSlots`) — answered without asking the engine.
      for (const typeId of typeIds) entries.push([typeId, noRackAtAll]);
      continue;
    }
    for (let i = 0; i < typeIds.length; i += BATCH) {
      if (!isLatest(id)) return { id, aborted: true };
      for (const typeId of typeIds.slice(i, i + BATCH)) {
        entries.push([typeId, packCheck(checkHullCandidate(shipTypeId, rack, typeId, skills))]);
      }
      await yieldToQueue();
    }
  }
  return isLatest(id) ? { id, entries } : { id, aborted: true };
}

// Only in a worker: the module is also imported by tests, where there is no `self` to listen on.
if (typeof WorkerGlobalScope !== 'undefined') {
  let latest = 0;
  self.onmessage = (event: MessageEvent<HullFitRequest>) => {
    latest = event.data.id;
    runHullFit(event.data, (id) => id === latest)
      .catch((error: unknown): HullFitReply => ({
        id: event.data.id,
        error: error instanceof Error ? error.message : String(error),
      }))
      .then((reply) => self.postMessage(reply));
  };
}
