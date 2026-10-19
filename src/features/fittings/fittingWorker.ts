/**
 * The one Web Worker the Fittings pages share (`hullFit.worker.ts`), and the
 * request/reply bookkeeping around it: the module browser's hull check
 * (`hullFitService`) and the stats evaluations (`evaluationService`) both
 * send their jobs through here. Without a `Worker` (jsdom, old browsers), or
 * once it has failed, `sendToWorker` answers null and the caller works on the
 * page instead.
 */
import type { EvaluationRequest, WorkerReply, WorkerRequest } from './hullFit.worker';

interface Waiting {
  resolve: (reply: WorkerReply) => void;
  reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextRequest = 0;
const pending = new Map<number, Waiting>();

function failPending(reason: Error) {
  for (const { reject } of pending.values()) reject(reason);
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./hullFit.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('error' in reply) waiting.reject(new Error(reply.error));
    else if ('aborted' in reply) waiting.reject(new Error('superseded'));
    else waiting.resolve(reply);
  };
  worker.onerror = () => {
    workerBroken = true;
    worker = null;
    failPending(new Error(WORKER_FAILED));
  };
  return worker;
}

/** The message a crashed worker rejects every waiting job with: the cue to work on the page. */
export const WORKER_FAILED = 'worker failed';
/** The message a job aborted through its signal rejects with. */
export const ABORTED = 'aborted';

/**
 * Sends the request `build` makes for a fresh id. Resolves with the worker's
 * reply; rejects `superseded` if the worker dropped it for a newer request,
 * `aborted` if `signal` fired first (the worker is told to skip it if it has
 * not started), or with the worker's own error. Null when there is no worker.
 */
export function sendToWorker(
  build: (id: number) => WorkerRequest,
  signal?: AbortSignal
): Promise<WorkerReply> | null {
  const target = ensureWorker();
  if (!target) return null;
  const id = ++nextRequest;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(ABORTED));
      return;
    }
    const onAbort = () => {
      if (!pending.delete(id)) return;
      target.postMessage({ kind: 'cancel', id } satisfies EvaluationRequest);
      reject(new Error(ABORTED));
    };
    pending.set(id, {
      resolve: (reply) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(reply);
      },
      reject: (reason) => {
        signal?.removeEventListener('abort', onAbort);
        reject(reason);
      },
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    target.postMessage(build(id));
  });
}
