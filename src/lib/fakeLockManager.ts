/**
 * Test double for the Web Locks API (`navigator.locks`), which neither Node
 * nor jsdom provides. One instance stands for one browser origin: every
 * simulated tab handed the same instance contends for the same locks.
 *
 * Faithful to the parts the app leans on — exclusive locks granted FIFO per
 * name, granted asynchronously, held until the callback's promise settles,
 * `request` resolving to the callback's result, and an aborted `signal`
 * dropping a still-queued request with an `AbortError`. Shared mode,
 * `ifAvailable`, `steal` and `query` are not modelled.
 */
type Callback = (lock: { name: string; mode: 'exclusive' }) => unknown;

interface Waiter {
  callback: Callback;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export interface FakeLockManager {
  request(name: string, callback: Callback): Promise<unknown>;
  request(name: string, options: { signal?: AbortSignal }, callback: Callback): Promise<unknown>;
  /** Names currently held — for assertions. */
  held(): string[];
}

export function createFakeLockManager(): FakeLockManager {
  const heldNames = new Set<string>();
  const queues = new Map<string, Waiter[]>();

  function pump(name: string) {
    if (heldNames.has(name)) return;
    const next = queues.get(name)?.shift();
    if (!next) return;
    if (next.onAbort) next.signal?.removeEventListener('abort', next.onAbort);
    heldNames.add(name);
    // Granted on a later task, as a browser does.
    setTimeout(() => {
      let result: Promise<unknown>;
      try {
        result = Promise.resolve(next.callback({ name, mode: 'exclusive' }));
      } catch (err) {
        result = Promise.reject(err);
      }
      result.then(next.resolve, next.reject).finally(() => {
        heldNames.delete(name);
        pump(name);
      });
    }, 0);
  }

  function request(
    name: string,
    optionsOrCallback: { signal?: AbortSignal } | Callback,
    maybeCallback?: Callback
  ): Promise<unknown> {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
    return new Promise((resolve, reject) => {
      const { signal } = options;
      if (signal?.aborted) {
        reject(new DOMException('The request was aborted.', 'AbortError'));
        return;
      }
      const waiter: Waiter = { callback, resolve, reject, signal };
      if (signal) {
        waiter.onAbort = () => {
          const queue = queues.get(name) ?? [];
          const index = queue.indexOf(waiter);
          if (index === -1) return; // already granted: abort no longer applies
          queue.splice(index, 1);
          reject(new DOMException('The request was aborted.', 'AbortError'));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      const queue = queues.get(name) ?? [];
      queue.push(waiter);
      queues.set(name, queue);
      pump(name);
    });
  }

  return {
    request: request as FakeLockManager['request'],
    held: () => [...heldNames],
  };
}
