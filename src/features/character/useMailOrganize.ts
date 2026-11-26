import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { grantHoldsEndpointScope } from '@/esi/grantScope';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { deleteMailOnEsi, setMailReadOnEsi } from '@/features/character/mail';
import { isMailRead, type MailRow } from '@/features/character/mailDisplay';
import type { OwnerSnapshot } from '@/features/character/mailSnapshot';

const ORGANIZE_CONCURRENCY = 3;

const addKey = (set: ReadonlySet<string>, key: string): ReadonlySet<string> =>
  set.has(key) ? set : new Set(set).add(key);
const dropKey = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
};

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
  onDeletedSelected: (key: string) => void;
  selectedKey: string | null;
  notify: (message: string) => void;
}

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

  const [holding, setHolding] = useState<ReadonlySet<number>>(new Set());
  const ownerIdsKey = owners.map((o) => o.characterId).join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = ownerIdsKey === '' ? [] : ownerIdsKey.split(',').map(Number);
    void Promise.all(
      ids.map(async (id) => ((await grantHoldsEndpointScope(id, 'putCharacterMail')) ? id : null))
    )
      .then((held) => {
        if (!cancelled) setHolding(new Set(held.filter((id): id is number => id !== null)));
      })
      .catch(() => {
        if (!cancelled) setHolding(new Set());
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
  const busyRef = useRef(false);
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
      const todo = targets.filter(
        (row) =>
          holding.has(row.ownerId) && isMailRead(row, locallyReadKeys, locallyUnreadKeys) !== read
      );
      if (todo.length === 0 || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      let failed = 0;
      let done = 0;
      try {
        await mapWithConcurrencyLimit(todo, ORGANIZE_CONCURRENCY, async (row) => {
          try {
            const result = await setMailReadOnEsi(row.ownerId, row.header.mail_id, read);
            if (result === 'done') {
              done += 1;
              if (read) markLocalRead(row.key);
              else markLocalUnread(row.key);
            } else if (result === 'failed') failed += 1;
          } catch {
            failed += 1;
          }
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      if (failed > 0) notify(t('mail.organizeFailed', { count: failed }));
      else if (done > 0) notify(t(read ? 'mail.markedRead' : 'mail.markedUnread', { count: done }));
    },
    [holding, locallyReadKeys, locallyUnreadKeys, markLocalRead, markLocalUnread, notify, t]
  );

  const [deleteTargets, setDeleteTargets] = useState<readonly MailRow[] | null>(null);
  const requestDelete = useCallback(
    (targets: readonly MailRow[]) => {
      const allowed = targets.filter((row) => holding.has(row.ownerId));
      if (allowed.length > 0) setDeleteTargets(allowed);
    },
    [holding]
  );
  const cancelDelete = useCallback(() => setDeleteTargets(null), []);
  const confirmDelete = useCallback(async () => {
    const targets = deleteTargets ?? [];
    const failedRows: MailRow[] = [];
    await mapWithConcurrencyLimit(targets, ORGANIZE_CONCURRENCY, async (row) => {
      let result: Awaited<ReturnType<typeof deleteMailOnEsi>>;
      try {
        result = await deleteMailOnEsi(row.ownerId, row.header.mail_id);
      } catch {
        result = 'failed';
      }
      if (result === 'done') {
        markLocalDeleted(row.key);
        if (row.key === selectedKey) onDeletedSelected(row.key);
        setCheckedKeys((prev) => dropKey(prev, row.key));
      } else failedRows.push(row);
    });
    if (failedRows.length > 0) {
      const gone = targets.length - failedRows.length;
      if (gone > 0) notify(t('mail.deleted', { count: gone }));
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
