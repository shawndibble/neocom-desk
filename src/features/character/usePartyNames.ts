import { useEffect, useState } from 'react';
import { NO_NAMES } from '@/lib/emptyCollections';
import { resolveNames } from '@/features/character/names';

export function usePartyNames(ids: readonly number[]): ReadonlyMap<number, string> {
  const [loaded, setLoaded] = useState<ReadonlyMap<number, string>>();
  const key = ids.join(',');
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    resolveNames(key.split(',').map(Number))
      .then((names) => {
        if (!cancelled) setLoaded(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);
  return loaded ?? NO_NAMES;
}
