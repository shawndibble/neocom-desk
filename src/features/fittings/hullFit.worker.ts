/// <reference lib="webworker" />
/**
 * The Fittings pages' heavy engine work, off the main thread. It loads its
 * own copy of the dogma engine through the same seam the page uses (ADR 0016)
 * — from the Cache Storage the page has already filled, so that is a read,
 * not a download — then answers two kinds of job:
 *
 * - the module browser's whole-catalogue hull check (`hullFitService`), one
 *   hull at a time. A newer request supersedes the one running: the run
 *   yields between batches, sees it, and stops.
 * - stats evaluations (`evaluationService`): Variations, "What to train",
 *   Compare and the weather comparison. They queue and run one by one, with
 *   the worker's event loop turning between them so a hull check or a
 *   `cancel` message is heard; a cancelled job that has not started is dropped.
 */
import { packCheck } from '@/engine/fittings/hullFitKey';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import {
  computeFittingStats,
  fittingSkillSources,
  loadDogmaEngine,
  type StatsOptions,
} from './dogmaFittingEngine';

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

interface EvaluationJob {
  id: number;
  fitting: Fitting;
  pilot: PilotProfile;
  /** Absent: the engine's uniform default. */
  damageProfile?: DamageProfile;
  options: StatsOptions;
}

/** One Fitting's stats under a pilot, Damage Profile and options. */
export interface StatsRequest extends EvaluationJob {
  kind: 'stats';
}

/** Every skill that modifies anything on a Fitting (`fittingSkillSources`). */
export interface SkillSourcesRequest extends EvaluationJob {
  kind: 'skillSources';
}

/** The caller no longer wants job `id`; skipped if it has not started. */
export interface CancelRequest {
  kind: 'cancel';
  id: number;
}

export type EvaluationRequest = StatsRequest | SkillSourcesRequest | CancelRequest;

export type EvaluationReply =
  | { id: number; stats: FittingStats }
  | { id: number; sources: number[] }
  | { id: number; aborted: true }
  | { id: number; error: string };

export type WorkerRequest = HullFitRequest | EvaluationRequest;
export type WorkerReply = HullFitReply | EvaluationReply;

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
  const engine = await loadDogmaEngine();
  const skills = new Map(skillLevels);
  const racks = engine.hullRacks(shipTypeId, skills);
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
        entries.push([
          typeId,
          packCheck(engine.checkHullCandidate(shipTypeId, rack, typeId, skills)),
        ]);
      }
      await yieldToQueue();
    }
  }
  return isLatest(id) ? { id, entries } : { id, aborted: true };
}

/** Answers one evaluation; `isCancelled` says the caller dropped it before it started. */
export async function runEvaluation(
  job: StatsRequest | SkillSourcesRequest,
  isCancelled: (id: number) => boolean
): Promise<EvaluationReply> {
  const { id, fitting, pilot, damageProfile, options } = job;
  if (isCancelled(id)) return { id, aborted: true };
  if (job.kind === 'skillSources') {
    return { id, sources: await fittingSkillSources(fitting, pilot, damageProfile, options) };
  }
  return {
    id,
    stats: await computeFittingStats(fitting, pilot, undefined, damageProfile, options),
  };
}

// Only in a worker: the module is also imported by tests, where there is no `self` to listen on.
if (typeof WorkerGlobalScope !== 'undefined') {
  let latestHullFit = 0;
  const queue: (StatsRequest | SkillSourcesRequest)[] = [];
  const cancelled = new Set<number>();
  let running: number | null = null;
  let draining = false;

  const reply = (message: WorkerReply) => self.postMessage(message);
  const errorReply = (id: number, error: unknown): WorkerReply => ({
    id,
    error: error instanceof Error ? error.message : String(error),
  });

  const drain = async () => {
    if (draining) return;
    draining = true;
    while (queue.length > 0) {
      const job = queue.shift()!;
      running = job.id;
      try {
        reply(await runEvaluation(job, (id) => cancelled.has(id)));
      } catch (error) {
        reply(errorReply(job.id, error));
      }
      cancelled.delete(job.id);
      running = null;
      // A hull check's next batch, or a cancel for the next job, gets in first.
      await yieldToQueue();
    }
    draining = false;
  };

  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    if (!('kind' in request)) {
      latestHullFit = request.id;
      runHullFit(request, (id) => id === latestHullFit)
        .catch((error: unknown) => errorReply(request.id, error))
        .then(reply);
    } else if (request.kind === 'cancel') {
      if (running === request.id || queue.some((job) => job.id === request.id)) {
        cancelled.add(request.id);
      }
    } else {
      queue.push(request);
      void drain();
    }
  };
}
