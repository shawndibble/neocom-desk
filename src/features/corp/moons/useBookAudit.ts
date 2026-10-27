import { useEffect, useState } from 'react';
import { readAudit, type AuditEntry } from '../taxBook/bookClient';
import { useBook } from './useBook';

/** The newest audit-log entries (D7), re-read whenever the book reloads. */
export function useBookAudit(count = 100): { entries: AuditEntry[]; loading: boolean } {
  const { characterId, corporationId, data } = useBook();
  const [state, setState] = useState<{ entries: AuditEntry[]; loading: boolean }>({
    entries: [],
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    readAudit(characterId, corporationId, count).then(
      (entries) => !cancelled && setState({ entries, loading: false }),
      () => !cancelled && setState({ entries: [], loading: false })
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, count, data]);
  return state;
}
