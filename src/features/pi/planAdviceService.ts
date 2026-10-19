/**
 * `buildPlanAdvice` as a worker call, for the PI tabs' main advice
 * (`useAdviceOf` is the caller). The stop-tier search per colony is a long
 * task, so it runs in `planAdvice.worker.ts` and the page keeps drawing.
 *
 * The SDE slice goes over once per object, the rest of the input per request,
 * and each answer is remembered per input object like `buildSharedPlanAdvice`,
 * so a tab switch reuses it. Where there is no Worker (jsdom, old browsers), or
 * it has failed, `planAdviceWorkerAvailable` says so and the caller runs the
 * same pure model on the page.
 */
import type { PiData } from '@/sde/types';
import type { PlanAdvice, PlanAdviceInput } from './planAdvice/types';
import {
  PI_NOT_LOADED,
  toWireInput,
  type PlanAdviceReply,
  type PlanAdviceRequest,
} from './planAdviceWire';

/** The worker could not take or answer the request: the page should run the model itself. */
export class PlanAdviceWorkerUnavailable extends Error {}

type Settled = { advice: PlanAdvice } | { error: Error };

let worker: Worker | null = null;
let workerBroken = false;
let nextRequest = 0;
let sentPi: PiData | null = null;
const pending = new Map<
  number,
  { resolve: (advice: PlanAdvice) => void; reject: (reason: Error) => void }
>();
const settled = new WeakMap<PlanAdviceInput, Settled>();
const inFlight = new WeakMap<PlanAdviceInput, Promise<PlanAdvice>>();

function failPending(reason: Error) {
  for (const { reject } of pending.values()) reject(reason);
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./planAdvice.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<PlanAdviceReply>) => {
    const reply = event.data;
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('advice' in reply) waiting.resolve(reply.advice);
    else if (reply.error === PI_NOT_LOADED) {
      // The slice never arrived (a failed clone): the page answers instead.
      sentPi = null;
      waiting.reject(new PlanAdviceWorkerUnavailable(reply.error));
    } else waiting.reject(new Error(reply.error));
  };
  const fail = () => {
    workerBroken = true;
    worker?.terminate();
    worker = null;
    sentPi = null;
    failPending(new PlanAdviceWorkerUnavailable('worker failed'));
  };
  worker.onerror = fail;
  worker.onmessageerror = fail;
  return worker;
}

/** Whether advice can go to the worker; false once it has failed. */
export function planAdviceWorkerAvailable(): boolean {
  return !workerBroken && typeof Worker !== 'undefined';
}

/** The answer already in hand for this input object, or null. Never starts work. */
export function peekPlanAdvice(input: PlanAdviceInput): Settled | null {
  return settled.get(input) ?? null;
}

/**
 * The advice for this input, built once per input object. Rejects with
 * `PlanAdviceWorkerUnavailable` when the worker cannot be used (run the model
 * on the page instead), and with a plain `Error` when the model itself threw.
 */
export function askPlanAdvice(input: PlanAdviceInput): Promise<PlanAdvice> {
  const known = settled.get(input);
  if (known) return 'advice' in known ? Promise.resolve(known.advice) : Promise.reject(known.error);
  const running = inFlight.get(input);
  if (running) return running;
  const target = ensureWorker();
  if (!target) return Promise.reject(new PlanAdviceWorkerUnavailable('no worker'));
  const id = ++nextRequest;
  const promise = new Promise<PlanAdvice>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      if (sentPi !== input.snapshot.pi) {
        sentPi = input.snapshot.pi;
        const load: PlanAdviceRequest = { kind: 'pi', pi: input.snapshot.pi };
        target.postMessage(load);
      }
      const request: PlanAdviceRequest = { kind: 'advice', id, input: toWireInput(input) };
      target.postMessage(request);
    } catch (error) {
      // Cloning the snapshot can fail (memory, an unclonable value): the page answers instead.
      pending.delete(id);
      sentPi = null;
      reject(
        new PlanAdviceWorkerUnavailable(error instanceof Error ? error.message : 'post failed')
      );
    }
  }).then(
    (advice) => {
      settled.set(input, { advice });
      inFlight.delete(input);
      return advice;
    },
    (error: Error) => {
      // A worker failure is not the input's fault: do not remember it.
      if (!(error instanceof PlanAdviceWorkerUnavailable)) settled.set(input, { error });
      inFlight.delete(input);
      throw error;
    }
  );
  inFlight.set(input, promise);
  return promise;
}
