import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { computeFittingStats, fittingSkillSources, type StatsOptions } from './dogmaFittingEngine';
import { ABORTED, sendToWorker, type WorkerSend } from './fittingWorker';
import type { WorkerReply } from './hullFit.worker';
import { yieldToEventLoop } from './yieldToEventLoop';

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

export async function computeStatsOffThread(
  fitting: Fitting,
  pilot: PilotProfile,
  damageProfile: DamageProfile | undefined,
  options: StatsOptions,
  signal?: AbortSignal,
  send: WorkerSend = sendToWorker
): Promise<FittingStats> {
  const reply = await viaWorker(
    send(
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
