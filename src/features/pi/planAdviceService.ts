import { abortError, createWorkerClient, isAbortError } from '@/lib/workerClient';
import type { PiData } from '@/sde/types';
import type { PlanAdvice, PlanAdviceInput } from './planAdvice/types';
import {
  PI_NOT_LOADED,
  toWireInput,
  type PlanAdviceReply,
  type PlanAdviceRequest,
} from './planAdviceWire';

export class PlanAdviceWorkerUnavailable extends Error {}

type Settled = { advice: PlanAdvice } | { error: Error };

interface Running {
  promise: Promise<PlanAdvice>;
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

export const planAdviceWorkerAvailable = client.available;

export function peekPlanAdvice(input: PlanAdviceInput): Settled | null {
  return settled.get(input) ?? null;
}

function waitFor(
  input: PlanAdviceInput,
  running: Running,
  signal: AbortSignal | undefined
): Promise<PlanAdvice> {
  if (!signal) return running.promise;
  return new Promise<PlanAdvice>((resolve, reject) => {
    const leave = () => {
      if (--running.waiters === 0) {
        if (inFlight.get(input) === running) inFlight.delete(input);
        running.abort.abort();
      }
      reject(abortError());
    };
    running.promise.then(resolve, reject);
    signal.addEventListener('abort', leave, { once: true });
  });
}

export function askPlanAdvice(input: PlanAdviceInput, signal?: AbortSignal): Promise<PlanAdvice> {
  const known = settled.get(input);
  if (known) return 'advice' in known ? Promise.resolve(known.advice) : Promise.reject(known.error);
  if (signal?.aborted) return Promise.reject(abortError());
  let running = inFlight.get(input);
  if (!running) {
    const abort = new AbortController();
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
