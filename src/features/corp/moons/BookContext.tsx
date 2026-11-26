import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { runningAccountRecords, dueCheckpoints } from '@/engine/corpTaxBook/runningAccountRecords';
import { chunk } from '@/lib/chunk';
import { editBook } from '../taxBook/bookClient';
import { invalidatePopSharing } from '../taxBook/popSharingCache';
import { BookContext, type BookContextValue } from './bookContextValue';
import { useReloadOnRecordedMail } from './useReloadOnRecordedMail';

export function BookProvider({
  value,
  children,
}: {
  value: Omit<BookContextValue, 'edit' | 'canEdit'>;
  children: ReactNode;
}) {
  const { characterId, corporationId, reload, verdict } = value;
  const edit = useCallback(
    async <Out,>(action: { action: string } & Record<string, unknown>) => {
      try {
        return await editBook<Out>(characterId, corporationId, action);
      } finally {
        if (action.action.startsWith('setPopSharing')) invalidatePopSharing(corporationId);
        reload();
      }
    },
    [characterId, corporationId, reload]
  );
  useRecordAccounts(value, verdict.canEdit);
  useReloadOnRecordedMail(corporationId, reload, verdict.canEdit);
  const merged = useMemo(
    () => ({ ...value, edit, canEdit: verdict.canEdit }),
    [value, edit, verdict.canEdit]
  );
  return <BookContext.Provider value={merged}>{children}</BookContext.Provider>;
}

const recorded = new Map<string, Map<string, string>>();
const sending = new Map<number, Promise<void>>();

function sendChanged<T extends { minerId: string }>(
  corporationId: number,
  kind: string,
  records: readonly T[],
  send: (batch: T[]) => Promise<unknown>,
  keyOf: (record: T) => string = (r) => JSON.stringify(r)
) {
  const key = `${corporationId}:${kind}`;
  const sent = recorded.get(key) ?? new Map<string, string>();
  recorded.set(key, sent);
  const changed = records.filter((r) => sent.get(r.minerId) !== keyOf(r));
  if (changed.length === 0) return;
  for (const r of changed) sent.set(r.minerId, keyOf(r));
  const before = sending.get(corporationId) ?? Promise.resolve();
  sending.set(
    corporationId,
    before.then(async () => {
      for (const batch of chunk(changed, 200)) {
        try {
          await send(batch);
        } catch {
          for (const r of batch) if (sent.get(r.minerId) === keyOf(r)) sent.delete(r.minerId);
        }
      }
    })
  );
}

function useRecordAccounts(value: Omit<BookContextValue, 'edit' | 'canEdit'>, canEdit: boolean) {
  const { view, data, characterId, corporationId } = value;
  const today = view.input.now.slice(0, 10);
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  }, [view]);
  useEffect(() => {
    const view = latest.current;
    const whole = !!data?.parts?.has('observed') && !!data.parts.has('ledger');
    if (!canEdit || !whole || data.moon) return;
    const due = new Map(
      data.scopedMiner === undefined
        ? dueCheckpoints(view, { at: view.input.now, by: characterId }).map((s) => [s.minerId, s])
        : []
    );
    sendChanged(
      corporationId,
      'accounts',
      runningAccountRecords(view, data.scopedMiner).map((a) =>
        due.has(a.minerId) ? { ...a, snapshot: due.get(a.minerId) } : a
      ),
      (accounts) => editBook(characterId, corporationId, { action: 'recordAccounts', accounts }),
      (a) => JSON.stringify({ ...a, snapshot: a.snapshot && { ...a.snapshot, at: undefined } })
    );
  }, [data, today, canEdit, characterId, corporationId]);
}
