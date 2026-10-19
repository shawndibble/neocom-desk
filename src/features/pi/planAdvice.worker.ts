/// <reference lib="webworker" />
/**
 * `buildPlanAdvice` off the main thread (`planAdviceService`). The model is a
 * pure function, so the worker only decodes the request and answers it. The
 * SDE slice (`pi`) is large and rarely changes, so it is sent once and kept
 * here; each request then carries the rest of the input. Requests are answered
 * in order and none is dropped: the page ignores a reply it no longer wants.
 */
import type { PiData } from '@/sde/types';
import type { PlannerSnapshot } from './goalPlannerModel';
import { buildPlanAdvice } from './planAdviceModel';
import type { PlanAdvice, PlanAdviceInput } from './planAdvice/types';

/** A `PlanAdviceInput` without the SDE slice, which travels separately. */
export type WirePlanAdviceInput = Omit<PlanAdviceInput, 'snapshot'> & {
  snapshot: Omit<PlannerSnapshot, 'pi'>;
};

export type PlanAdviceRequest =
  { kind: 'pi'; pi: PiData } | { kind: 'advice'; id: number; input: WirePlanAdviceInput };

export type PlanAdviceReply = { id: number; advice: PlanAdvice } | { id: number; error: string };

export interface PlanAdviceWorkerState {
  pi: PiData | null;
}

export function emptyPlanAdviceState(): PlanAdviceWorkerState {
  return { pi: null };
}

export function toWireInput(input: PlanAdviceInput): WirePlanAdviceInput {
  const { pi, ...snapshot } = input.snapshot;
  void pi;
  return { ...input, snapshot };
}

/** One request against the loaded SDE slice; a request before it is an error, not a guess. */
export function answerPlanAdvice(
  state: PlanAdviceWorkerState,
  request: Extract<PlanAdviceRequest, { kind: 'advice' }>
): PlanAdviceReply {
  const { pi } = state;
  if (!pi) return { id: request.id, error: 'pi not loaded' };
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

// Only in a worker: the module is also imported by tests, where there is no `self` to listen on.
if (typeof WorkerGlobalScope !== 'undefined') {
  const state = emptyPlanAdviceState();
  self.onmessage = (event: MessageEvent<PlanAdviceRequest>) => {
    const request = event.data;
    if (request.kind === 'pi') state.pi = request.pi;
    else self.postMessage(answerPlanAdvice(state, request));
  };
}
