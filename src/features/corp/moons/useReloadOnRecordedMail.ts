/**
 * The send queue mails a Late notice from the shell, outside the book's page, and records the mail
 * on the notice (`recordLateNoticeMail`). Nothing on the page re-reads the book after that, so the
 * notice still read "not mailed" until a reload. This re-reads the book once a notice mail of this
 * corporation is recorded, a moment after the last one when a run records several.
 */
import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { isLateNoticeMail } from '@/engine/corpTaxBook/mailQueue';

/** How long after the last recorded mail the book is read again, so a run reloads once. */
const SETTLE_MS = 1_500;

export function useReloadOnRecordedMail(
  corporationId: number,
  reload: () => void,
  enabled: boolean
): { recorded: number | undefined } {
  const recorded = useLiveQuery(async () => {
    if (!enabled) return [];
    try {
      const items = await db.corpMailQueue.where('corporationId').equals(corporationId).toArray();
      return items.filter((i) => i.logged && isLateNoticeMail(i.kind)).map((i) => i.id);
    } catch {
      return [];
    }
  }, [corporationId, enabled]);
  // What was recorded before this page opened is in the book it read already.
  const seen = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  useEffect(() => {
    if (recorded === undefined) return;
    if (seen.current === null) {
      seen.current = new Set(recorded);
      return;
    }
    const fresh = recorded.filter((id) => !seen.current!.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.current.add(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => reloadRef.current(), SETTLE_MS);
  }, [recorded]);
  useEffect(() => () => clearTimeout(timer.current), []);
  /** The notice mails recorded so far; undefined until the queue is read. */
  return { recorded: recorded?.length };
}
