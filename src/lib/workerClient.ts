/**
 * The page side of a request/reply Worker: one lazily spawned worker, a
 * request id per call, and the failure paths every service shares (no Worker,
 * a spawn or post that throws, `onerror`). A service keeps what it has already
 * sent (`reset` forgets it when the worker is lost) and how a reply settles.
 *
 * `spawn` stays at the call site so Vite sees the `new URL(..., import.meta.url)`
 * literal inside `new Worker(...)` and bundles the worker.
 */
export interface Waiting<Out> {
  resolve: (out: Out) => void;
  reject: (reason: Error) => void;
}

export interface WorkerClientOptions<Reply extends { id: number }, Out> {
  spawn: () => Worker;
  /** Turns one reply into the answer (or a rejection) for the request it carries. */
  settle: (reply: Reply, waiting: Waiting<Out>) => void;
  /** The error for a worker that cannot take or answer a request. */
  unavailable: (message: string) => Error;
  /** The worker was lost or a post failed: forget what it had been sent. */
  reset?: () => void;
  /** The message that withdraws a queued request, for an aborted `send`. */
  cancel?: (id: number) => unknown;
}

export interface WorkerClient<Out> {
  /** Whether requests can go to a worker; false once it has failed. */
  available: () => boolean;
  /** Posts via `post` under a fresh id; an abort withdraws the request and rejects with an `AbortError`. */
  send: (post: (target: Worker, id: number) => void, signal?: AbortSignal) => Promise<Out>;
}

export function createWorkerClient<Reply extends { id: number }, Out>(
  options: WorkerClientOptions<Reply, Out>
): WorkerClient<Out> {
  let worker: Worker | null = null;
  let broken = false;
  let nextRequest = 0;
  const pending = new Map<number, Waiting<Out>>();

  const available = () => !broken && typeof Worker !== 'undefined';

  function ensureWorker(): Worker | null {
    if (!available()) return null;
    if (worker) return worker;
    try {
      worker = options.spawn();
    } catch {
      broken = true;
      return null;
    }
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const waiting = pending.get(event.data.id);
      if (!waiting) return;
      pending.delete(event.data.id);
      options.settle(event.data, waiting);
    };
    const fail = () => {
      broken = true;
      worker?.terminate();
      worker = null;
      options.reset?.();
      const reason = options.unavailable('worker failed');
      for (const { reject } of pending.values()) reject(reason);
      pending.clear();
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    return worker;
  }

  function send(post: (target: Worker, id: number) => void, signal?: AbortSignal) {
    const target = ensureWorker();
    if (!target) return Promise.reject(options.unavailable('no worker'));
    if (signal?.aborted) return Promise.reject(abortError());
    const id = ++nextRequest;
    return new Promise<Out>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      signal?.addEventListener(
        'abort',
        () => {
          if (!pending.delete(id)) return;
          reject(abortError());
          try {
            if (options.cancel) target.postMessage(options.cancel(id));
          } catch {
            // The request is already unwanted; a lost cancel only costs the worker one run.
          }
        },
        { once: true }
      );
      try {
        post(target, id);
      } catch (error) {
        // Cloning the input can fail (memory, an unclonable value).
        pending.delete(id);
        options.reset?.();
        reject(options.unavailable(error instanceof Error ? error.message : 'post failed'));
      }
    });
  }

  return { available, send };
}

export function abortError(): Error {
  return new DOMException('aborted', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
