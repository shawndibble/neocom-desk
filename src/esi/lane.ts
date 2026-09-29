/**
 * Which lane of the app-wide ESI gate a request queues in (issue #2271).
 *
 * `budget.ts`'s gate has two lanes. Work nobody is watching — the Foreground
 * Poller's per-Character fan-out and the boot prefetch — queues **low**, never
 * holds the last `ESI_FOREGROUND_RESERVE` permits, and yields every freed
 * permit to a waiting view. Everything else is foreground by default, so no
 * call site can lose priority by forgetting to ask for it.
 *
 * ## Carrying the lane
 *
 * A lane has to travel from the background caller down to `esiFetch`, through
 * feature loaders that know nothing about it. Browsers have no async context,
 * so it travels in two ways:
 *
 * - **Ambiently, across synchronous calls only.** `inBackgroundLane(fn)` sets
 *   the lane for exactly as long as `fn` runs synchronously. The entry points
 *   that matter read it before their first `await`: `loadWithCacheStatus` /
 *   `loadPaginatedWithCacheStatus` (`cache.ts`), `fetchAllPagesStatus`
 *   (`paginated.ts`) and `esiFetch` (`client.ts`).
 * - **Explicitly, from there down.** The cache hands its load's ticket back to
 *   the ambient slot around each `fetchLive()` call it makes after its own
 *   awaits, `fetchAllPagesStatus` passes it to every page, and `esiFetch`
 *   carries it past its token await to the gate.
 *
 * What escapes both — a loader that `await`s something before calling the
 * next loader — simply runs foreground. That is the safe direction: background
 * work occasionally taking foreground priority costs a view a little, while
 * the reverse would park a view behind a poll.
 *
 * ## Promotion
 *
 * Every background cache load gets a ticket of its own (`laneForLoad`), stored
 * with its in-flight dedupe entry. A foreground caller that joins that load is
 * now waiting on it, so `cache.ts` promotes the ticket: its queued gate waits
 * move to the foreground lane, and its later ones (pages 2..N, a 304 re-ask)
 * queue there too.
 */
import type { PriorityTicket } from '@/lib/concurrency';

/** A request's lane at the gate: a low ticket for background work, `undefined` for foreground. */
export type EsiLane = PriorityTicket;

let ambient: EsiLane | undefined;

/** The lane a request started right now would queue in. `undefined` is foreground. */
export function currentEsiLane(): EsiLane | undefined {
  return ambient;
}

/** Run `fn` with `lane` ambient for its synchronous part, then restore the outer lane. */
export function withEsiLane<T>(lane: EsiLane | undefined, fn: () => T): T {
  const outer = ambient;
  ambient = lane;
  try {
    return fn();
  } finally {
    ambient = outer;
  }
}

/**
 * Run `fn` as background work: every ESI read it *starts synchronously* queues
 * in the low lane. Wrap the innermost synchronous call — wrapping a whole
 * fan-out would tag only what runs before its first `await`.
 */
export function inBackgroundLane<T>(fn: () => T): T {
  return withEsiLane({ priority: 'low' }, fn);
}

/**
 * A fresh ticket for one cache load, when that load is started by background
 * work; `undefined` for a foreground one. Per load rather than shared, so a
 * view joining one key promotes that key and not the whole poll behind it.
 */
export function laneForLoad(): EsiLane | undefined {
  return ambient?.priority === 'low' ? { priority: 'low' } : undefined;
}
