/**
 * What every `/corp/moons` component needs from the ready book, so the tabs
 * and dialogs take few props: the joined view, names, who the viewer is, and
 * `edit` — one action through `editBook` (ADR 0023), then a reload.
 */
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { noteDirectorHeld } from './checkpointHolds';
import { accountRecords, dueCheckpoints } from '@/engine/corpTaxBook/accountRecords';
import { chunk } from '@/lib/chunk';
import { editBook, recordCheckpoints } from '../taxBook/bookClient';
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

/** What this tab last recorded per book, kind and Miner, so an unchanged record is never sent again. */
const recorded = new Map<string, Map<string, string>>();
/** The sends in flight per book, chained. */
const sending = new Map<number, Promise<void>>();

/**
 * Sends each Miner's record that changed since this tab last sent it, 200 at a time, one send
 * at a time per book and in order, so an older record never lands over a newer one. Best effort
 * and quiet: a refusal is sent again on the next change or visit.
 */
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

/**
 * What only an officer's tab can work out, since the server cannot price days (#6294, decision
 * 20261120-235011): each Miner's Running account figures for the pay page (`recordAccounts`),
 * and each closed-through checkpoint that is due (`recordCheckpoints`). Sent once the book's rows
 * and payments are read, and again whenever they change; no reload.
 */
function useRecordAccounts(value: Omit<BookContextValue, 'edit' | 'canEdit'>, canEdit: boolean) {
  const { view, data, characterId, corporationId } = value;
  useEffect(() => {
    // Only a read with every row and payment counts. A moon page's read (`BookRead.moon`) holds
    // other Miners' days only in part; a one-Miner page counts that Miner only.
    // A context built by hand (a story, a test) may carry no parts: then it counts nothing.
    const whole = !!data?.parts?.has('observed') && !!data.parts.has('ledger');
    if (!canEdit || !whole || (data as { moon?: unknown }).moon) return;
    sendChanged(corporationId, 'accounts', accountRecords(view, data.scopedMiner), (accounts) =>
      editBook(characterId, corporationId, { action: 'recordAccounts', accounts })
    );
    const at = { at: view.input.now, by: characterId };
    sendChanged(
      corporationId,
      'checkpoints',
      dueCheckpoints(view, at, data.scopedMiner),
      async (checkpoints) => {
        const { skipped } = await recordCheckpoints(characterId, corporationId, checkpoints);
        noteDirectorHeld(
          corporationId,
          skipped.filter((x) => x.reason === 'director-approval').map((x) => x.minerId)
        );
      },
      // When it was worked out is no change to send again; a stored one that went (a regroup, a
      // Director's reset) is.
      (c) =>
        JSON.stringify({
          ...c,
          at: undefined,
          stored: view.input.checkpoints?.get(c.minerId)?.through ?? null,
        })
    );
  }, [view, data, canEdit, characterId, corporationId]);
}
