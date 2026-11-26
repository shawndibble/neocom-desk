import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { isLateNoticeMail } from '@/engine/corpTaxBook/mailQueue';

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
  return { recorded: recorded?.length };
}
