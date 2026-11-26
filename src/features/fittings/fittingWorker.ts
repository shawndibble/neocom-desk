import type { EvaluationRequest, WorkerReply, WorkerRequest } from './hullFit.worker';

interface Waiting {
  resolve: (reply: WorkerReply) => void;
  reject: (reason: Error) => void;
}

export type WorkerSend = (
  build: (id: number) => WorkerRequest,
  signal?: AbortSignal
) => Promise<WorkerReply> | null;

export const WORKER_FAILED = 'worker failed';
export const ABORTED = 'aborted';

let nextRequest = 0;

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
    get inFlight() {
      return pending.size;
    },
    get usable() {
      return !broken && !closed;
    },
    close() {
      closed = true;
      worker?.terminate();
      worker = null;
      failPending(new Error(ABORTED));
    },
  };
}

const shared = createChannel();

export const sendToWorker: WorkerSend = shared.send;

export interface WorkerPool {
  send: WorkerSend;
  size: number;
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

export function searchPoolSize(): number {
  if (typeof Worker === 'undefined') return 1;
  const cores = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1;
  return Math.max(1, Math.min(4, cores - 1));
}
