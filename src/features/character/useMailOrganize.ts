import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { grantHoldsEndpointScope } from '@/esi/grantScope';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { deleteMailOnEsi, setMailReadOnEsi } from '@/features/character/mail';
import { isMailRead, type MailRow } from '@/features/character/mailDisplay';
import type { OwnerSnapshot } from '@/features/character/mailSnapshot';

/** Writes in flight at once: a handful, so a bulk action stays well inside ESI's error budget. */
const ORGANIZE_CONCURRENCY = 3;

const addKey = (set: ReadonlySet<string>, key: string): ReadonlySet<string> =>
  set.has(key) ? set : new Set(set).add(key);
const dropKey = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
};

/**
 * What the pilot did to mail this session, before the next load catches up:
 * read, unread and deleted mail, by row key. In memory only. The cached
 * headers are patched by `mail.ts`, so a reload agrees.
 */
export function useMailReadState() {
  const [locallyReadKeys, setRead] = useState<ReadonlySet<string>>(new Set());
  const [locallyUnreadKeys, setUnread] = useState<ReadonlySet<string>>(new Set());
  const [deletedKeys, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const markLocalRead = useCallback((key: string) => {
    setRead((prev) => addKey(prev, key));
    setUnread((prev) => dropKey(prev, key));
  }, []);
  const markLocalUnread = useCallback((key: string) => {
    setUnread((prev) => addKey(prev, key));
    setRead((prev) => dropKey(prev, key));
  }, []);
  const markLocalDeleted = useCallback(
    (key: string) => setDeleted((prev) => addKey(prev, key)),
    []
  );
  return {
    locallyReadKeys,
    locallyUnreadKeys,
    deletedKeys,
    markLocalRead,
    markLocalUnread,
    markLocalDeleted,
  };
}

interface MailOrganizeInput {
  owners: readonly OwnerSnapshot[];
  rows: readonly MailRow[];
  readState: ReturnType<typeof useMailReadState>;
  /** Called when the open mail was deleted, so the reading pane lets go of it. */
  onDeletedSelected: (key: string) => void;
  selectedKey: string | null;
  notify: (message: string) => void;
}

/**
 * Mark read / unread and delete for Mail, on ESI (`organize_mail`, the Write
 * to EVE Permission), plus Select mode. Nothing here is stored: ESI is the
 * source of truth and the cached headers are patched by `mail.ts`.
 */
export function useMailOrganize({
  owners,
  rows,
  readState,
  onDeletedSelected,
  selectedKey,
  notify,
}: MailOrganizeInput) {
  const { t } = useTranslation();
  const { locallyReadKeys, locallyUnreadKeys, markLocalRead, markLocalUnread, markLocalDeleted } =
    readState;

  // Which mailboxes hold the Permission. Mark unread and delete share one scope.
  const [holding, setHolding] = useState<ReadonlySet<number>>(new Set());
  const ownerIdsKey = owners.map((o) => o.characterId).join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = ownerIdsKey === '' ? [] : ownerIdsKey.split(',').map(Number);
    void Promise.all(
      ids.map(async (id) => ((await grantHoldsEndpointScope(id, 'putCharacterMail')) ? id : null))
    ).then((held) => {
      if (!cancelled) setHolding(new Set(held.filter((id): id is number => id !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [ownerIdsKey]);
  const canOrganize = useCallback((row: MailRow) => holding.has(row.ownerId), [holding]);
  const anyOrganizable = holding.size > 0;

  const [selecting, setSelectingState] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const setSelecting = useCallback((on: boolean) => {
    setSelectingState(on);
    setCheckedKeys(new Set());
  }, []);
  const toggleCheck = useCallback((row: MailRow) => {
    setCheckedKeys((prev) => (prev.has(row.key) ? dropKey(prev, row.key) : addKey(prev, row.key)));
  }, []);
  const checkedRows = useMemo(
    () => rows.filter((row) => checkedKeys.has(row.key) && holding.has(row.ownerId)),
    [rows, checkedKeys, holding]
  );

  const setRead = useCallback(
    async (targets: readonly MailRow[], read: boolean) => {
      // Only mail that would actually change: a re-mark is a wasted write.
      const todo = targets.filter(
        (row) =>
          holding.has(row.ownerId) && isMailRead(row, locallyReadKeys, locallyUnreadKeys) !== read
      );
      if (todo.length === 0) return;
      setBusy(true);
      let failed = 0;
      let done = 0;
      await mapWithConcurrencyLimit(todo, ORGANIZE_CONCURRENCY, async (row) => {
        const result = await setMailReadOnEsi(row.ownerId, row.header.mail_id, read);
        if (result === 'done') {
          done += 1;
          if (read) markLocalRead(row.key);
          else markLocalUnread(row.key);
        } else if (result === 'failed') failed += 1;
      });
      setBusy(false);
      if (failed > 0) notify(t('mail.organizeFailed', { count: failed }));
      else if (done > 0) notify(t(read ? 'mail.markedRead' : 'mail.markedUnread', { count: done }));
    },
    [holding, locallyReadKeys, locallyUnreadKeys, markLocalRead, markLocalUnread, notify, t]
  );

  /** The mails a Delete… is waiting on, while its confirm is open. */
  const [deleteTargets, setDeleteTargets] = useState<readonly MailRow[] | null>(null);
  const requestDelete = useCallback(
    (targets: readonly MailRow[]) => {
      const allowed = targets.filter((row) => holding.has(row.ownerId));
      if (allowed.length > 0) setDeleteTargets(allowed);
    },
    [holding]
  );
  const cancelDelete = useCallback(() => setDeleteTargets(null), []);
  /** Deletes the confirmed mails. Rejects when any failed (the confirm stays open on those). */
  const confirmDelete = useCallback(async () => {
    const targets = deleteTargets ?? [];
    const failedRows: MailRow[] = [];
    await mapWithConcurrencyLimit(targets, ORGANIZE_CONCURRENCY, async (row) => {
      const result = await deleteMailOnEsi(row.ownerId, row.header.mail_id);
      if (result === 'done') {
        markLocalDeleted(row.key);
        if (row.key === selectedKey) onDeletedSelected(row.key);
        setCheckedKeys((prev) => dropKey(prev, row.key));
      } else failedRows.push(row);
    });
    if (failedRows.length > 0) {
      setDeleteTargets(failedRows);
      throw new Error('mail delete failed');
    }
    setDeleteTargets(null);
    notify(t('mail.deleted', { count: targets.length }));
  }, [deleteTargets, markLocalDeleted, notify, onDeletedSelected, selectedKey, t]);

  return {
    canOrganize,
    anyOrganizable,
    selecting,
    setSelecting,
    checkedKeys,
    checkedRows,
    toggleCheck,
    busy,
    setRead,
    deleteTargets,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
