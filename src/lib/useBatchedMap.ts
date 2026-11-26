import { useEffect, useState } from 'react';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from './concurrency';

const PUBLISH_EVERY = 25;

export interface BatchedMap<V> {
  values: ReadonlyMap<string, V>;
  pending: number;
}

const NONE: BatchedMap<unknown> = { values: new Map(), pending: 0 };

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
