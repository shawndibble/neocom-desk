export interface Waiting<Out> {
  resolve: (out: Out) => void;
  reject: (reason: Error) => void;
}

export interface WorkerClientOptions<Reply extends { id: number }, Out> {
  spawn: () => Worker;
  settle: (reply: Reply, waiting: Waiting<Out>) => void;
  unavailable: (message: string) => Error;
  reset?: () => void;
  cancel?: (id: number) => unknown;
}

export interface WorkerClient<Out> {
  available: () => boolean;
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
          } catch {}
        },
        { once: true }
      );
      try {
        post(target, id);
      } catch (error) {
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
