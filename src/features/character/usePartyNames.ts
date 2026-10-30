import { useEffect, useState } from 'react';
import { NO_NAMES } from '@/lib/emptyCollections';
import { resolveNames } from '@/features/character/names';

/**
 * Names for a journal's Journal Parties, by id. Empty until the lookup lands, and
 * for an id ESI cannot name; callers show the id then.
 */
export function usePartyNames(ids: readonly number[]): ReadonlyMap<number, string> {
  const [loaded, setLoaded] = useState<ReadonlyMap<number, string>>();
  // Keyed on the ids' content: the array is new whenever the journal is reclassified.
  const key = ids.join(',');
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    resolveNames(key.split(',').map(Number))
      .then((names) => {
        if (!cancelled) setLoaded(names);
      })
      .catch(() => {
        // Offline or rate limited: the ids stay on screen.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return loaded ?? NO_NAMES;
}
