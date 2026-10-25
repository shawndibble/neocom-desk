/**
 * Test double for the Web Locks API (`navigator.locks`), which neither Node
 * nor jsdom provides. One instance stands for one browser origin: every
 * simulated tab handed the same instance contends for the same locks.
 *
 * Faithful to the parts the app leans on — exclusive locks granted FIFO per
 * name, granted asynchronously, held until the callback's promise settles,
 * `request` resolving to the callback's result, and an aborted `signal`
 * dropping a still-queued request with an `AbortError`, `ifAvailable`
 * calling back with `null` when the lock is taken, and `steal` taking the lock
 * at once — the previous holder's `request` rejects with an `AbortError` while
 * its callback runs on, no longer holding anything (and, as in a browser,
 * `steal` alongside `signal` or `ifAvailable` is refused), and `query` listing
 * the waiting requests. Shared mode and `query`'s held list are not modelled.
 */
type Callback = (lock: { name: string; mode: 'exclusive' } | null) => unknown;

interface Waiter {
  callback: Callback;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export interface FakeLockManager {
  request(name: string, callback: Callback): Promise<unknown>;
  request(
    name: string,
    options: { signal?: AbortSignal; ifAvailable?: boolean; steal?: boolean },
    callback: Callback
  ): Promise<unknown>;
  query(): Promise<{ pending: { name: string }[] }>;
  /** Names currently held — for assertions. */
  held(): string[];
}

export function createFakeLockManager(): FakeLockManager {
  const heldNames = new Set<string>();
  const queues = new Map<string, Waiter[]>();

  /** The current holder of each held name — a steal rejects it. */
  const holders = new Map<string, Waiter>();

  function grant(name: string, waiter: Waiter) {
    heldNames.add(name);
    holders.set(name, waiter);
    // Granted on a later task, as a browser does.
    setTimeout(() => {
      let result: Promise<unknown>;
      try {
        result = Promise.resolve(waiter.callback({ name, mode: 'exclusive' }));
      } catch (err) {
        result = Promise.reject(err);
      }
      result.then(waiter.resolve, waiter.reject).finally(() => {
        // Stolen meanwhile: the lock is someone else's now.
        if (holders.get(name) !== waiter) return;
        holders.delete(name);
        heldNames.delete(name);
        pump(name);
      });
    }, 0);
  }

  function pump(name: string) {
    if (heldNames.has(name)) return;
    const next = queues.get(name)?.shift();
    if (!next) return;
    if (next.onAbort) next.signal?.removeEventListener('abort', next.onAbort);
    grant(name, next);
  }

  function request(
    name: string,
    optionsOrCallback: { signal?: AbortSignal; ifAvailable?: boolean; steal?: boolean } | Callback,
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
      if (options.ifAvailable && (heldNames.has(name) || (queues.get(name)?.length ?? 0) > 0)) {
        setTimeout(() => {
          Promise.resolve()
            .then(() => callback(null))
            .then(resolve, reject);
        }, 0);
        return;
      }
      const waiter: Waiter = { callback, resolve, reject, signal };
      if (options.steal && (signal || options.ifAvailable)) {
        reject(new DOMException('steal cannot be combined.', 'NotSupportedError'));
        return;
      }
      if (options.steal) {
        const holder = holders.get(name);
        holders.delete(name);
        heldNames.delete(name);
        holder?.reject(new DOMException('The lock was stolen.', 'AbortError'));
        grant(name, waiter);
        return;
      }
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
    query: async () => ({
      pending: [...queues].flatMap(([name, queue]) => queue.map(() => ({ name }))),
    }),
    held: () => [...heldNames],
  };
}
