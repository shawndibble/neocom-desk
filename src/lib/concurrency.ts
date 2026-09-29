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

/**
 * Which lane an `acquire` queues in. `low` is for work nobody is watching —
 * background polling and prefetching — and yields to `normal` at every
 * admission.
 */
export type Priority = 'normal' | 'low';

/**
 * A priority shared by a group of acquires, so the group can be promoted as
 * one: `promote` moves every queued waiter holding this ticket into the
 * `normal` lane, and any later `acquire` with it queues there too. Mutable on
 * purpose — the semaphore flips `priority`; callers only create tickets.
 */
export interface PriorityTicket {
  priority: Priority;
}

export interface SemaphoreOptions {
  /**
   * Permits `low` acquires may never take, kept free for `normal` ones: `low`
   * holders are capped at `limit - lowReserve`. Defaults to 0.
   */
  lowReserve?: number;
}

export interface Semaphore {
  /**
   * Resolves with a release function once a permit is free. Rejects — without
   * taking a permit — if `signal` aborts first, so an abandoned waiter can
   * never wedge the pool. With no `ticket` (or a `normal` one) it queues in
   * the `normal` lane.
   */
  acquire(signal?: AbortSignal, ticket?: PriorityTicket): Promise<Release>;
  /**
   * Raise `ticket` to `normal`: its queued waiters move into the `normal`
   * lane, in the order they first arrived. Permits it already holds are
   * unaffected. Never demotes.
   */
  promote(ticket: PriorityTicket): void;
  /** Permits currently held. Diagnostics and tests only. */
  readonly inFlight: number;
}

interface Waiter {
  /** Arrival order, so a promoted waiter keeps its place relative to the lane it joins. */
  readonly seq: number;
  readonly ticket: PriorityTicket | undefined;
  /** Hand this waiter a permit counted against `lane`. */
  readonly admit: (lane: Priority) => void;
}

/**
 * A counting semaphore with two FIFO lanes.
 *
 * `mapWithConcurrencyLimit` caps one call site's fan-out; this caps a *shared*
 * resource across call sites that cannot see each other — `esi/budget.ts`'s
 * app-wide in-flight ceiling is its only caller. FIFO within a lane matters
 * there: a fan-out over a thousand type ids must not starve the one request a
 * user is watching. The lanes matter for the same reason one level up: a
 * background poll across every Character must not make the page the user is
 * looking at queue behind it (issue #2271).
 *
 * Every freed permit goes to the oldest `normal` waiter, and only then to the
 * oldest `low` one — and only while `low` holders are under
 * `limit - lowReserve`. With no `normal` demand, `low` work uses every
 * non-reserved permit, so a lane is never starved by the reserve alone; it
 * waits only while `normal` work is actually queued, which is bounded.
 *
 * Safe to acquire from inside a `mapWithConcurrencyLimit` callback **only**
 * while no permit holder waits on another permit — see `esi/budget.ts`'s header
 * for why that holds at the `esiFetch` leaf and nowhere above it.
 */
export function createSemaphore(limit: number, options: SemaphoreOptions = {}): Semaphore {
  const lowLimit = Math.max(1, limit - (options.lowReserve ?? 0));
  let held = 0;
  let lowHeld = 0;
  let seq = 0;
  const lanes: Record<Priority, Waiter[]> = { normal: [], low: [] };

  /**
   * A release that is idempotent — a double call must not free two permits —
   * and that gives the permit back to the lane it was admitted in, whatever
   * its ticket was promoted to since, so the `low` count cannot drift.
   */
  function releaseOnce(lane: Priority): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      held -= 1;
      if (lane === 'low') lowHeld -= 1;
      drain();
    };
  }

  /** Admit as many waiters as the permits allow: `normal` first, then `low` under its cap. */
  function drain(): void {
    while (held < limit) {
      const lane: Priority | null =
        lanes.normal.length > 0
          ? 'normal'
          : lanes.low.length > 0 && lowHeld < lowLimit
            ? 'low'
            : null;
      if (lane === null) return;
      const waiter = lanes[lane].shift() as Waiter;
      held += 1;
      if (lane === 'low') lowHeld += 1;
      waiter.admit(lane);
    }
  }

  return {
    get inFlight() {
      return held;
    },
    acquire(signal?: AbortSignal, ticket?: PriorityTicket): Promise<Release> {
      if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }
      return new Promise<Release>((resolve, reject) => {
        const onAbort = (): void => {
          for (const queue of [lanes.normal, lanes.low]) {
            const index = queue.indexOf(waiter);
            if (index >= 0) queue.splice(index, 1);
          }
          reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        const waiter: Waiter = {
          seq: (seq += 1),
          ticket,
          admit: (lane) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(releaseOnce(lane));
          },
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        lanes[ticket?.priority ?? 'normal'].push(waiter);
        drain();
      });
    },
    promote(ticket: PriorityTicket): void {
      if (ticket.priority === 'normal') return;
      ticket.priority = 'normal';
      const moving = lanes.low.filter((waiter) => waiter.ticket === ticket);
      if (moving.length === 0) return;
      lanes.low = lanes.low.filter((waiter) => waiter.ticket !== ticket);
      lanes.normal = [...lanes.normal, ...moving].sort((a, b) => a.seq - b.seq);
      drain();
    },
  };
}
