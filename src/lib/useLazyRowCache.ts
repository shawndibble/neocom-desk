/**
 * One `Map<key, value>` of resolved results plus the in-flight/failed
 * tracking around it — the shape `OpenOrdersPanel` hand-rolled six times
 * (region competition, structure book, jump distance, refine comparison, hub
 * prices, price history), each keyed differently but doing the same thing:
 * fetch a key once, on demand (a row expanding), skip a key already resolved
 * or already in flight, and leave a failure uncached so the next demand
 * retries it.
 */
import { useCallback, useRef, useState } from 'react';

export interface LazyRowCacheLoadOptions {
  /**
   * Marks the key attempted the instant `load` is called, and keeps it that
   * way — success OR failure — until `reset(key)`, rather than leaving a
   * rejected fetch retryable on the very next `load` call for that key (the
   * default): for a fetch where failure is a normal, possibly-permanent
   * outcome (an ACL-denied structure) rather than a transient one worth
   * retrying on every unrelated re-render, only a deliberate `reset` (a
   * "check again" button) should re-arm it.
   */
  sticky?: boolean;
}

export interface LazyRowCache<K, V> {
  /** Resolved values so far. A fresh `Map` each time an entry is added, so it is safe to use directly in a `useMemo`/`useEffect` dependency array. */
  byKey: ReadonlyMap<K, V>;
  loadingKeys: ReadonlySet<K>;
  /** Keys whose most recent attempt rejected. For a non-`sticky` load this clears on the next `load` call for that key, the moment it starts. */
  failedKeys: ReadonlySet<K>;
  /**
   * Fetches `key` via `fetchValue` unless it is already resolved or already
   * in flight, then stores the result. Returns the underlying promise —
   * never rejecting, a failure is caught internally — so a caller can await
   * it, e.g. to bound a fan-out over several keys with
   * `mapWithConcurrencyLimit`.
   *
   * Dedup is checked and (for a would-be first attempt) marked
   * synchronously, before `fetchValue` is even called — not by reading
   * `loadingKeys` state, which several `load` calls for different keys made
   * in one synchronous pass (e.g. a sweep over five trade hubs) would each
   * see as stale, since none of the earlier calls' state updates have
   * committed yet. That would let every key in the sweep re-fire on each of
   * the others' completions.
   *
   * Referentially stable across renders — along with `reset` — so either can
   * sit in an effect's dependency array without re-running that effect on
   * every render.
   */
  load: (key: K, fetchValue: () => Promise<V>, options?: LazyRowCacheLoadOptions) => Promise<void>;
  /**
   * Invalidates `key`: clears its attempted-gate and any failed state, so
   * the next `load` call for it fires a fresh fetch regardless of what's
   * already resolved. General-purpose, not `sticky`-only — used both to
   * re-arm a permanently-gated `sticky` key for one more attempt, and to
   * force an unconditional refetch of a key whose value may be stale for a
   * reason the key itself doesn't capture (`useOrderBookOrchestration`'s
   * Variations price cache, paired with `load` on every manual refresh).
   */
  reset: (key: K) => void;
}

/** Lazily fetches and caches one value per key, on demand, for exactly the "row expand" shape `LazyRowCache` documents. */
export function useLazyRowCache<K, V>(): LazyRowCache<K, V> {
  const [byKey, setByKey] = useState<ReadonlyMap<K, V>>(() => new Map());
  const [loadingKeys, setLoadingKeys] = useState<ReadonlySet<K>>(() => new Set());
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<K>>(() => new Set());

  // Attempted-or-resolved keys — see `load`'s doc comment for why this has
  // to be a ref, checked and set synchronously, rather than derived from the
  // state above.
  const attemptedRef = useRef<Set<K>>(new Set());

  const load = useCallback(
    (key: K, fetchValue: () => Promise<V>, options?: LazyRowCacheLoadOptions): Promise<void> => {
      const sticky = options?.sticky ?? false;
      if (attemptedRef.current.has(key)) return Promise.resolve();
      attemptedRef.current.add(key);
      setLoadingKeys((prev) => new Set(prev).add(key));
      setFailedKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return fetchValue()
        .then((value) => {
          setByKey((prev) => new Map(prev).set(key, value));
        })
        .catch(() => {
          // Left uncached so a non-sticky key's next `load` call retries.
          setFailedKeys((prev) => new Set(prev).add(key));
          if (!sticky) attemptedRef.current.delete(key);
        })
        .finally(() => {
          setLoadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        });
    },
    []
  );

  const reset = useCallback((key: K) => {
    attemptedRef.current.delete(key);
    setFailedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  return { byKey, loadingKeys, failedKeys, load, reset };
}
