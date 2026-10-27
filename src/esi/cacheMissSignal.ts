/**
 * One-way notification that a read-through load is about to go to ESI, and why.
 *
 * Exists so an observer (`src/instrument.ts`'s Sentry span) can tell a first
 * visit's unavoidable fan-out from a cache that should have answered — Sentry's
 * "N+1 API Call" detector sees only the requests, not whether anything was
 * stored. Same shape as `authFailureSignal.ts`: `src/esi` publishes and gains
 * no dependency on whoever listens.
 *
 * Carries a key *family*, never the key: a corp key holds a corporation id, and
 * the request URLs beside the span already name the type or planet.
 */

/**
 * - `cold`: nothing stored for the key.
 * - `expired`: a row is stored but past its freshness window. Includes a
 *   conditional revalidation that ESI answers 304 — still a request.
 * - `refresh`: a row inside its window, forced live by a manual Refresh.
 */
export type CacheMissReason = 'cold' | 'expired' | 'refresh';

export interface CacheMiss {
  family: string;
  reason: CacheMissReason;
  /** A game-data row shared by every Character (`GLOBAL_CACHE_CHARACTER_ID`). */
  global: boolean;
}

/** Returns what to call when the live load settles, or nothing. */
type CacheMissListener = (miss: CacheMiss) => (() => void) | void;

const listeners = new Set<CacheMissListener>();

/** Returns an unsubscribe. */
export function onCacheMiss(listener: CacheMissListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Announces a miss; the returned function marks its live load settled. */
export function beginCacheMiss(miss: CacheMiss): () => void {
  if (listeners.size === 0) return noop;
  const ends: (() => void)[] = [];
  // A throwing listener must not fail the ESI read it is observing.
  for (const listener of listeners) {
    try {
      const end = listener(miss);
      if (end) ends.push(end);
    } catch {
      // ignored
    }
  }
  return () => {
    for (const end of ends) {
      try {
        end();
      } catch {
        // ignored
      }
    }
  };
}

function noop(): void {}
