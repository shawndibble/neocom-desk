import { useEffect, useRef, useState } from 'react';
import { hasWalletScope, loadWalletJournalHistory } from '@/features/character/wallet';
import type { OwnJournal } from './claimWalletCheck';

/**
 * The signed-in user's own wallet journals for the given Characters, one read per Character for
 * as long as the card list is open. Read on this device with that Character's own token; nothing
 * read here is sent anywhere. A Character without the wallet scope is `noScope`, never read.
 */
export function useOwnWalletJournals(
  characterIds: readonly number[]
): ReadonlyMap<number, OwnJournal> {
  const [journals, setJournals] = useState<ReadonlyMap<number, OwnJournal>>(new Map());
  const started = useRef(new Set<number>());
  const key = [...new Set(characterIds)].sort((a, b) => a - b).join(',');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const ids = key === '' ? [] : key.split(',').map(Number);
    for (const id of ids) {
      if (started.current.has(id)) continue;
      started.current.add(id);
      void (async (): Promise<OwnJournal> => {
        try {
          if (!(await hasWalletScope(id))) return { state: 'noScope' };
          const read = await loadWalletJournalHistory(id);
          return read.cached ? { state: 'ok', entries: read.cached.data } : { state: 'failed' };
        } catch {
          return { state: 'failed' };
        }
      })().then((result) => {
        if (mounted.current) setJournals((prev) => new Map(prev).set(id, result));
      });
    }
  }, [key]);
  return journals;
}
