/**
 * Stats evaluations off the main thread: Variations, "What to train",
 * Fitting Compare and the weather comparison each run many whole-Fitting
 * calculations, and every one is a synchronous engine call. They go to the
 * shared worker (`hullFit.worker.ts`) where the browser has one; on the page
 * otherwise (jsdom, old browsers, a worker that failed), with the main thread
 * handed back before each, as the callers used to do by hand.
 *
 * A `signal` cancels a job: it rejects `aborted` at once, and the worker
 * skips it if it has not started.
 */
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { computeFittingStats, fittingSkillSources, type StatsOptions } from './dogmaFittingEngine';
import { ABORTED, sendToWorker } from './fittingWorker';
import type { WorkerReply } from './hullFit.worker';
import { yieldToEventLoop } from './yieldToEventLoop';

/**
 * The worker's answer, or null to work on the page: no worker, or it failed
 * (crashed, or could not load its engine copy — the page's own may be fine).
 */
async function viaWorker(reply: Promise<WorkerReply> | null): Promise<WorkerReply | null> {
  if (reply === null) return null;
  try {
    return await reply;
  } catch (error) {
    if (error instanceof Error && error.message === ABORTED) throw error;
    return null;
  }
}

async function onPage<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  await yieldToEventLoop();
  if (signal?.aborted) throw new Error(ABORTED);
  return run();
}

/** `fitting`'s stats under `pilot`, `damageProfile` and `options`. */
export async function computeStatsOffThread(
  fitting: Fitting,
  pilot: PilotProfile,
  damageProfile: DamageProfile | undefined,
  options: StatsOptions,
  signal?: AbortSignal
): Promise<FittingStats> {
  const reply = await viaWorker(
    sendToWorker(
      (id) => ({
        kind: 'stats',
        id,
        fitting,
        pilot,
        ...(damageProfile === undefined ? {} : { damageProfile }),
        options,
      }),
      signal
    )
  );
  if (reply && 'stats' in reply) return reply.stats;
  return onPage(signal, () =>
    computeFittingStats(fitting, pilot, undefined, damageProfile, options)
  );
}

/** Every skill that modifies anything on `fitting` under `pilot` ("What to train"'s candidates). */
export async function skillSourcesOffThread(
  fitting: Fitting,
  pilot: PilotProfile,
  damageProfile: DamageProfile | undefined,
  options: StatsOptions,
  signal?: AbortSignal
): Promise<number[]> {
  const reply = await viaWorker(
    sendToWorker(
      (id) => ({
        kind: 'skillSources',
        id,
        fitting,
        pilot,
        ...(damageProfile === undefined ? {} : { damageProfile }),
        options,
      }),
      signal
    )
  );
  if (reply && 'sources' in reply) return reply.sources;
  return onPage(signal, () => fittingSkillSources(fitting, pilot, damageProfile, options));
}
