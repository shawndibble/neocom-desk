import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { readAudit, type AuditEntry } from '../taxBook/bookClient';
import { useBook } from './useBook';

const NONE: AuditEntry[] = [];

/** The newest audit-log entries (D7), re-read whenever the book reloads. */
export function useBookAudit(count = 100): {
  entries: AuditEntry[];
  loading: boolean;
  /** The read threw: `entries` is unknown, not empty. */
  failed: boolean;
  retry: () => void;
} {
  const { characterId, corporationId, data } = useBook();
  const load = useCallback(
    () => readAudit(characterId, corporationId, count),
    // `data` is the re-read trigger: a book reload refreshes behind the entries on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, corporationId, count, data]
  );
  const read = useKeyedLoad(`${characterId}:${corporationId}:${count}`, load);
  return {
    entries: read.status === 'ready' ? read.data : NONE,
    loading: read.status === 'idle' || read.status === 'loading',
    failed: read.status === 'failed',
    retry: read.retry,
  };
}
