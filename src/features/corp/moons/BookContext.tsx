/**
 * What every `/corp/moons` component needs from the ready book, so the tabs
 * and dialogs take few props: the joined view, names, who the viewer is, and
 * `edit` — one action through `editBook` (ADR 0023), then a reload.
 */
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { accountRecords } from '@/engine/corpTaxBook/accountRecords';
import { chunk } from '@/lib/chunk';
import { editBook } from '../taxBook/bookClient';
import { invalidatePopSharing } from '../taxBook/popSharingCache';
import { BookContext, type BookContextValue } from './bookContextValue';

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
        // Even a refused edit may have changed what is on screen (a stale view).
        if (action.action.startsWith('setPopSharing')) invalidatePopSharing(corporationId);
        reload();
      }
    },
    [characterId, corporationId, reload]
  );
  useRecordAccounts(value, verdict.canEdit);
  const merged = useMemo(
    () => ({ ...value, edit, canEdit: verdict.canEdit }),
    [value, edit, verdict.canEdit]
  );
  return <BookContext.Provider value={merged}>{children}</BookContext.Provider>;
}

/** What this tab last recorded per book and Miner, so an unchanged account is never sent again. */
const recorded = new Map<number, Map<string, string>>();
/** The sends in flight per book, chained. */
const sending = new Map<number, Promise<void>>();

/**
 * A running account's figures for the pay page (#6294): the server cannot price days, so an
 * editor's tab records each Miner's account once its rows and payments are read, and again
 * whenever it changes. Best effort and quiet: no reload, and a refusal leaves the page as it was.
 */
function useRecordAccounts(value: Omit<BookContextValue, 'edit' | 'canEdit'>, canEdit: boolean) {
  const { view, data, characterId, corporationId } = value;
  useEffect(() => {
    // Only a read with every row and payment counts. A moon page's read (`BookRead.moon`) holds
    // other Miners' days only in part; a one-Miner page counts that Miner only.
    const whole = data.parts.has('observed') && data.parts.has('ledger');
    if (!canEdit || !whole || (data as { moon?: unknown }).moon) return;
    const sent = recorded.get(corporationId) ?? new Map<string, string>();
    recorded.set(corporationId, sent);
    const changed = accountRecords(view, data.scopedMiner).filter(
      (a) => sent.get(a.minerId) !== JSON.stringify(a)
    );
    if (changed.length === 0) return;
    for (const a of changed) sent.set(a.minerId, JSON.stringify(a));
    // One send at a time per book, in order, so an older count never lands over a newer one.
    const before = sending.get(corporationId) ?? Promise.resolve();
    sending.set(
      corporationId,
      before.then(async () => {
        for (const accounts of chunk(changed, 200)) {
          try {
            await editBook(characterId, corporationId, { action: 'recordAccounts', accounts });
          } catch {
            // Sent again on the next change or visit, unless a newer count is already queued.
            for (const x of accounts)
              if (sent.get(x.minerId) === JSON.stringify(x)) sent.delete(x.minerId);
          }
        }
      })
    );
  }, [view, data, canEdit, characterId, corporationId]);
}
