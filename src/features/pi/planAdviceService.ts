/**
 * `buildPlanAdvice` as a worker call, for the PI tabs' main advice
 * (`useAdviceOf` is the caller). The stop-tier search per colony is a long
 * task, so it runs in `planAdvice.worker.ts` and the page keeps drawing.
 *
 * The SDE slice goes over once per object, the rest of the input per request,
 * and each answer is remembered per input object like `buildSharedPlanAdvice`,
 * so a tab switch reuses it. Where there is no Worker (jsdom, old browsers), or
 * it has failed, `planAdviceWorkerAvailable` says so and the caller runs the
 * same pure model on the page. A caller that no longer wants an answer aborts
 * its signal: a request still queued in the worker is withdrawn.
 */
import { abortError, createWorkerClient, isAbortError } from '@/lib/workerClient';
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

interface Running {
  promise: Promise<PlanAdvice>;
  /** Callers still waiting; the request is withdrawn only when the last signalled one leaves. */
  waiters: number;
  abort: AbortController;
}

let sentPi: PiData | null = null;
const settled = new WeakMap<PlanAdviceInput, Settled>();
const inFlight = new WeakMap<PlanAdviceInput, Running>();

const client = createWorkerClient<PlanAdviceReply, PlanAdvice>({
  spawn: () => new Worker(new URL('./planAdvice.worker.ts', import.meta.url), { type: 'module' }),
  settle: (reply, waiting) => {
    if ('advice' in reply) waiting.resolve(reply.advice);
    else if (reply.error === PI_NOT_LOADED) {
      // The slice never arrived (a failed clone): the page answers instead.
      sentPi = null;
      waiting.reject(new PlanAdviceWorkerUnavailable(reply.error));
    } else waiting.reject(new Error(reply.error));
  },
  unavailable: (message) => new PlanAdviceWorkerUnavailable(message),
  reset: () => {
    sentPi = null;
  },
  cancel: (id): PlanAdviceRequest => ({ kind: 'cancel', id }),
});

/** Whether advice can go to the worker; false once it has failed. */
export const planAdviceWorkerAvailable = client.available;

/** The answer already in hand for this input object, or null. Never starts work. */
export function peekPlanAdvice(input: PlanAdviceInput): Settled | null {
  return settled.get(input) ?? null;
}

/** This caller's view of a shared request: it rejects on its own abort, and releases its claim. */
function waitFor(
  input: PlanAdviceInput,
  running: Running,
  signal: AbortSignal | undefined
): Promise<PlanAdvice> {
  if (!signal) return running.promise;
  return new Promise<PlanAdvice>((resolve, reject) => {
    const leave = () => {
      if (--running.waiters === 0) {
        // Forget it now, not when the rejection lands: a re-ask in this tick must start fresh.
        if (inFlight.get(input) === running) inFlight.delete(input);
        running.abort.abort();
      }
      reject(abortError());
    };
    running.promise.then(resolve, reject);
    signal.addEventListener('abort', leave, { once: true });
  });
}

/**
 * The advice for this input, built once per input object. Rejects with
 * `PlanAdviceWorkerUnavailable` when the worker cannot be used (run the model
 * on the page instead), with a plain `Error` when the model itself threw, and
 * with an `AbortError` when `signal` fired first.
 */
export function askPlanAdvice(input: PlanAdviceInput, signal?: AbortSignal): Promise<PlanAdvice> {
  const known = settled.get(input);
  if (known) return 'advice' in known ? Promise.resolve(known.advice) : Promise.reject(known.error);
  if (signal?.aborted) return Promise.reject(abortError());
  let running = inFlight.get(input);
  if (!running) {
    const abort = new AbortController();
    // Only the entry still registered: a withdrawn one may already have been replaced.
    const release = () => {
      if (inFlight.get(input) === running) inFlight.delete(input);
    };
    const promise = client
      .send((target, id) => {
        if (sentPi !== input.snapshot.pi) {
          sentPi = input.snapshot.pi;
          const load: PlanAdviceRequest = { kind: 'pi', pi: input.snapshot.pi };
          target.postMessage(load);
        }
        const request: PlanAdviceRequest = { kind: 'advice', id, input: toWireInput(input) };
        target.postMessage(request);
      }, abort.signal)
      .then(
        (advice) => {
          settled.set(input, { advice });
          release();
          return advice;
        },
        (error: Error) => {
          // A worker failure or a withdrawal is not the input's fault: do not remember it.
          if (!(error instanceof PlanAdviceWorkerUnavailable) && !isAbortError(error)) {
            settled.set(input, { error });
          }
          release();
          throw error;
        }
      );
    inFlight.set(input, (running = { promise, waiters: 0, abort }));
  }
  running.waiters++;
  return waitFor(input, running, signal);
}
