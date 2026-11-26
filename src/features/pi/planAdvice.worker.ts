/// <reference lib="webworker" />
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

export function createPlanAdviceQueue(state: PlanAdviceWorkerState) {
  const queue: Queued[] = [];
  return {
    receive(request: PlanAdviceRequest) {
      if (request.kind !== 'cancel') return void queue.push(request);
      const at = queue.findIndex((r) => r.kind === 'advice' && r.id === request.id);
      if (at >= 0) queue.splice(at, 1);
    },
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

if (typeof WorkerGlobalScope !== 'undefined') {
  const queue = createPlanAdviceQueue(emptyPlanAdviceState());
  let draining = false;
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
