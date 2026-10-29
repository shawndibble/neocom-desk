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

/** Sends one request to a worker, as `sendToWorker` does; null when there is none. */
export type WorkerSend = (
  build: (id: number) => WorkerRequest,
  signal?: AbortSignal
) => Promise<WorkerReply> | null;

/** The message a crashed worker rejects every waiting job with: the cue to work on the page. */
export const WORKER_FAILED = 'worker failed';
/** The message a job aborted through its signal rejects with. */
export const ABORTED = 'aborted';

let nextRequest = 0;

/** One lazily started worker and the request/reply bookkeeping around it. */
function createChannel() {
  let worker: Worker | null = null;
  let broken = false;
  let closed = false;
  const pending = new Map<number, Waiting>();

  function failPending(reason: Error) {
    for (const { reject } of pending.values()) reject(reason);
    pending.clear();
  }

  function ensure(): Worker | null {
    if (broken || closed || typeof Worker === 'undefined') return null;
    if (worker) return worker;
    let created: Worker;
    try {
      created = new Worker(new URL('./hullFit.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      broken = true;
      return null;
    }
    worker = created;
    created.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const waiting = pending.get(reply.id);
      if (!waiting) return;
      pending.delete(reply.id);
      if ('error' in reply) waiting.reject(new Error(reply.error));
      else if ('aborted' in reply) waiting.reject(new Error('superseded'));
      else waiting.resolve(reply);
    };
    created.onerror = () => {
      broken = true;
      worker = null;
      failPending(new Error(WORKER_FAILED));
    };
    return created;
  }

  const send: WorkerSend = (build, signal) => {
    const target = ensure();
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
  };

  return {
    send,
    /** Jobs waiting on the worker still in flight: the pool sends to the idlest. */
    get inFlight() {
      return pending.size;
    },
    /** False once the worker crashed or was closed: the pool leaves it out. */
    get usable() {
      return !broken && !closed;
    },
    /** Ends the worker; what still waits rejects `aborted`. */
    close() {
      closed = true;
      worker?.terminate();
      worker = null;
      failPending(new Error(ABORTED));
    },
  };
}

const shared = createChannel();

/**
 * Sends the request `build` makes for a fresh id. Resolves with the worker's
 * reply; rejects `superseded` if the worker dropped it for a newer request,
 * `aborted` if `signal` fired first (the worker is told to skip it if it has
 * not started), or with the worker's own error. Null when there is no worker.
 */
export const sendToWorker: WorkerSend = shared.send;

/**
 * Up to `size` workers of their own, for one search whose calculations do not
 * depend on each other (Improve). Each starts on its first job; `send` goes
 * to the one with the fewest jobs waiting. Separate from the shared worker, so
 * a hull check or another page's evaluation never queues behind a search.
 */
export interface WorkerPool {
  send: WorkerSend;
  size: number;
  /** Ends every worker. */
  close: () => void;
}

export function createWorkerPool(size: number): WorkerPool {
  const channels = Array.from({ length: Math.max(1, size) }, createChannel);
  return {
    size: channels.length,
    send: (build, signal) => {
      const live = channels.filter((c) => c.usable);
      if (live.length === 0) return null;
      const idlest = live.reduce((best, c) => (c.inFlight < best.inFlight ? c : best));
      return idlest.send(build, signal);
    },
    close: () => channels.forEach((c) => c.close()),
  };
}

/** How many workers a search may use: `min(4, hardwareConcurrency - 1)`, at least 1; 1 with no Worker. */
export function searchPoolSize(): number {
  if (typeof Worker === 'undefined') return 1;
  const cores = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1;
  return Math.max(1, Math.min(4, cores - 1));
}
