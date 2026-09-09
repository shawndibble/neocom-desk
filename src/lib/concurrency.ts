/**
 * One ESI fan-out policy, so there is a single number to tune. ESI bills
 * against a global error-limit budget and `CLAUDE.md` requires respecting
 * `X-Ratelimit-*`/`Retry-After`, so an unbounded `Promise.all` over a thousand
 * type ids — or every Character in the roster — is not theoretical.
 *
 * This is a cap **per call site**, not app-wide: a dozen of them run at once on
 * a busy boot and stack. The app-wide ceiling that bounds their sum lives in
 * `esi/budget.ts`, at the one place every ESI request passes through.
 */
export const ESI_FANOUT_CONCURRENCY = 10;

/** Runs `fn` over `items`, at most `limit` calls in flight at a time. */
export async function mapWithConcurrencyLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

/** A permit held for the duration of one operation; call it to give the permit back. */
export type Release = () => void;

export interface Semaphore {
  /**
   * Resolves with a release function once a permit is free. Rejects — without
   * taking a permit — if `signal` aborts first, so an abandoned waiter can
   * never wedge the pool.
   */
  acquire(signal?: AbortSignal): Promise<Release>;
  /** Permits currently held. Diagnostics and tests only. */
  readonly inFlight: number;
}

/**
 * A FIFO counting semaphore.
 *
 * `mapWithConcurrencyLimit` caps one call site's fan-out; this caps a *shared*
 * resource across call sites that cannot see each other — `esi/budget.ts`'s
 * app-wide in-flight ceiling is its only caller. FIFO matters there: a fan-out
 * over a thousand type ids must not starve the one request a user is watching.
 *
 * Safe to acquire from inside a `mapWithConcurrencyLimit` callback **only**
 * while no permit holder waits on another permit — see `esi/budget.ts`'s header
 * for why that holds at the `esiFetch` leaf and nowhere above it.
 */
export function createSemaphore(limit: number): Semaphore {
  let held = 0;
  const waiting: Array<() => void> = [];

  /** A release that is idempotent: a double call must not free two permits. */
  function releaseOnce(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiting.shift();
      // Hand the permit straight to the next waiter rather than dropping the
      // count and re-racing for it.
      if (next) next();
      else held -= 1;
    };
  }

  return {
    get inFlight() {
      return held;
    },
    acquire(signal?: AbortSignal): Promise<Release> {
      if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }
      if (held < limit) {
        held += 1;
        return Promise.resolve(releaseOnce());
      }
      return new Promise<Release>((resolve, reject) => {
        let settled = false;
        const admit = (): void => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          resolve(releaseOnce());
        };
        const onAbort = (): void => {
          if (settled) return;
          settled = true;
          const index = waiting.indexOf(admit);
          if (index >= 0) waiting.splice(index, 1);
          reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        waiting.push(admit);
      });
    },
  };
}
