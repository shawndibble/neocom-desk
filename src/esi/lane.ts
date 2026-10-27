/**
 * Which lane of the app-wide ESI gate a request queues in (issues #2271, #2281).
 *
 * `budget.ts`'s gate has three lanes. Work nobody is watching — the Foreground
 * Poller's per-Character fan-out and the boot prefetch — queues **low**, never
 * holds the last `ESI_FOREGROUND_RESERVE` permits, and yields every freed
 * permit to a waiting view. Everything else is foreground by default, so no
 * call site can lose priority by forgetting to ask for it.
 *
 * Foreground itself splits by Character: a view's reads for the **active**
 * Character queue **high**, ahead of its reads for every other Character, so
 * a board that fans out across every Character (Overview's orders snapshot
 * reads skills, implants and standings for each) gets its own Character's
 * reads through without waiting behind the others. `esiFetch` decides it per
 * request from its `characterId` (`gateLane`); nothing above it has to know.
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
 * now waiting on it, so `cache.ts` promotes the ticket to the lane that view's
 * own read would have taken (`viewPriority`: high for the active Character,
 * normal otherwise): its queued gate waits move there, and its later ones
 * (pages 2..N, a 304 re-ask) queue there too.
 *
 * Promotion is per load, not per call tree. A cache load started from inside
 * a background load's `fetchLive` (a loader that reads another key on the
 * way) mints a ticket of its own and is **not** promoted with its parent: a
 * view joining the parent waits on the child too, but the child keeps queuing
 * low unless a view joins it directly.
 */
import type { Priority, PriorityTicket } from '@/lib/concurrency';

/** A request's lane at the gate: a low ticket for background work, `undefined` for foreground. */
export type EsiLane = PriorityTicket;

let ambient: EsiLane | undefined;

/** Reads the active Character's id. `src/esi` cannot import `stores/`, so the app injects it. */
export type GetActiveCharacterId = () => number | null;

let getActiveCharacterId: GetActiveCharacterId | null = null;

/**
 * Inject (or clear) where the active Character's id is read from. Unset, no
 * read queues high — every foreground read is `normal`, as before #2281.
 */
export function configureActiveCharacter(get: GetActiveCharacterId | null): void {
  getActiveCharacterId = get;
}

/** The lane a view's read for `characterId` queues in: high for the active Character. */
export function viewPriority(characterId: number | undefined): Priority {
  return characterId !== undefined &&
    getActiveCharacterId !== null &&
    characterId === getActiveCharacterId()
    ? 'high'
    : 'normal';
}

/**
 * The ticket `esiFetch` hands the gate for a request in `lane`. A ticket it
 * already has (background, or one a view promoted) is kept as is — it is
 * shared with the rest of its load, which is what makes promotion work. A
 * foreground read gets a fresh high ticket for the active Character, and no
 * ticket (normal) for anyone else.
 */
export function gateLane(
  lane: EsiLane | undefined,
  characterId: number | undefined
): EsiLane | undefined {
  if (lane !== undefined) return lane;
  return viewPriority(characterId) === 'high' ? { priority: 'high' } : undefined;
}

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
