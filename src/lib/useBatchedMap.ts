import { useEffect, useState } from 'react';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from './concurrency';

const PUBLISH_EVERY = 25;

export interface BatchedMap<V> {
  /** Each entry's value once loaded; absent until then. */
  values: ReadonlyMap<string, V>;
  /** Entries still to load. */
  pending: number;
}

const NONE: BatchedMap<unknown> = { values: new Map(), pending: 0 };

/**
 * Load a value per entry of `key` (a comma-joined, value-stable list), a few
 * at a time. Results are published in batches rather than one render per
 * entry, so a few hundred rows don't re-render a table a few hundred times.
 * An empty `key` loads nothing; a new `key` (or `load`, which should be
 * stable) discards the old results. `load` should absorb its own failures.
 */
export function useBatchedMap<V>(key: string, load: (entry: string) => Promise<V>): BatchedMap<V> {
  const [state, setState] = useState<{ key: string; value: BatchedMap<V> }>({
    key: '',
    value: NONE as BatchedMap<V>,
  });

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const entries = key.split(',');
    const values = new Map<string, V>();
    const publish = () => {
      if (!cancelled) {
        setState({
          key,
          value: { values: new Map(values), pending: entries.length - values.size },
        });
      }
    };
    void mapWithConcurrencyLimit(entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
      values.set(entry, await load(entry));
      if (values.size % PUBLISH_EVERY === 0) publish();
    }).then(publish);
    return () => {
      cancelled = true;
    };
  }, [key, load]);

  if (key === '') return NONE as BatchedMap<V>;
  if (state.key !== key) {
    return { values: NONE.values as BatchedMap<V>['values'], pending: key.split(',').length };
  }
  return state.value;
}
