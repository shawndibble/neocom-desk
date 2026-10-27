/// <reference lib="webworker" />
/**
 * `buildPlanAdvice` off the main thread (`planAdviceService`). The model is a
 * pure function, so the worker only decodes the request and answers it. The
 * SDE slice (`pi`) is large and rarely changes, so it is sent once and kept
 * here; each request then carries the rest of the input. Requests are answered
 * in order; a cancel withdraws a request that has not started, and the page ignores
 * a reply it no longer wants.
 */
import type { PiData } from '@/sde/types';
import { buildPlanAdvice } from './planAdviceModel';
import type { PlanAdviceInput } from './planAdvice/types';
import { PI_NOT_LOADED, type PlanAdviceReply, type PlanAdviceRequest } from './planAdviceWire';

export interface PlanAdviceWorkerState {
  pi: PiData | null;
}

export function emptyPlanAdviceState(): PlanAdviceWorkerState {
  return { pi: null };
}

/** One request against the loaded SDE slice; a request before it is an error, not a guess. */
export function answerPlanAdvice(
  state: PlanAdviceWorkerState,
  request: Extract<PlanAdviceRequest, { kind: 'advice' }>
): PlanAdviceReply {
  const { pi } = state;
  if (!pi) return { id: request.id, error: PI_NOT_LOADED };
  try {
    const input: PlanAdviceInput = {
      ...request.input,
      snapshot: { ...request.input.snapshot, pi },
    };
    return { id: request.id, advice: buildPlanAdvice(input) };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}

type Queued = Exclude<PlanAdviceRequest, { kind: 'cancel' }>;

/**
 * Messages that arrived and have not run yet. A cancel removes its request if it is
 * still queued, which is the only time a synchronous build can be withdrawn.
 */
export function createPlanAdviceQueue(state: PlanAdviceWorkerState) {
  const queue: Queued[] = [];
  return {
    receive(request: PlanAdviceRequest) {
      if (request.kind !== 'cancel') return void queue.push(request);
      const at = queue.findIndex((r) => r.kind === 'advice' && r.id === request.id);
      if (at >= 0) queue.splice(at, 1);
    },
    /** Runs the oldest queued message; null for a slice load, or when nothing is queued. */
    runNext(): PlanAdviceReply | null {
      const request = queue.shift();
      if (!request) return null;
      if (request.kind === 'pi') {
        state.pi = request.pi;
        return null;
      }
      return answerPlanAdvice(state, request);
    },
    get size() {
      return queue.length;
    },
  };
}

// Only in a worker: the module is also imported by tests, where there is no `self` to listen on.
if (typeof WorkerGlobalScope !== 'undefined') {
  const queue = createPlanAdviceQueue(emptyPlanAdviceState());
  let draining = false;
  // One job per macrotask, so a cancel posted while a job ran is read before the next one starts.
  const drain = () => {
    const reply = queue.runNext();
    if (reply) self.postMessage(reply);
    if (queue.size) setTimeout(drain, 0);
    else draining = false;
  };
  self.onmessage = (event: MessageEvent<PlanAdviceRequest>) => {
    queue.receive(event.data);
    if (draining) return;
    draining = true;
    setTimeout(drain, 0);
  };
}
